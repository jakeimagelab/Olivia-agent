import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSupabaseAdminMock } = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import { POST as login } from "@/app/api/pick/[eventSlug]/login/route";
import { POST as logout } from "@/app/api/pick/[eventSlug]/logout/route";
import { GET as me } from "@/app/api/pick/[eventSlug]/me/route";
import { createPersonSelectSession, PERSON_SELECT_COOKIE } from "@/lib/person-select/session";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_SLUG = "sgy-2026-teachers";

type QueryState = {
  filters: Record<string, unknown>;
  countOnly: boolean;
  single: boolean;
  write: boolean;
};

function createSupabaseMock() {
  const event = {
    id: EVENT_ID,
    slug: EVENT_SLUG,
    title: "서공예 졸업앨범 · 선생님 사진",
    status: "open",
    categories: [{ key: "profile", label: "선생님 프로필", pick: 1 }],
    retouch_options: [],
    memo_max: 300,
    deadline_at: "2027-10-20T09:00:00.000Z",
  };
  const person = {
    id: PERSON_ID,
    event_id: EVENT_ID,
    display_name: "최동기",
    login_name: "최동기",
    pin_code: "0420",
    group_label: "4반",
    first_seen_at: null,
    last_seen_at: null,
    submitted_at: null,
  };

  const resolve = (table: string, state: QueryState) => {
    if (state.write) return { data: null, error: null };
    if (table === "person_select_login_attempts") return { data: null, count: 0, error: null };
    if (table === "person_select_events") {
      const matches = (!state.filters.id || state.filters.id === event.id)
        && (!state.filters.slug || state.filters.slug === event.slug);
      return { data: matches ? event : null, error: null };
    }
    if (table === "person_select_people") {
      const matches = (!state.filters.id || state.filters.id === person.id)
        && (!state.filters.event_id || state.filters.event_id === person.event_id)
        && (!state.filters.login_name || state.filters.login_name === person.login_name);
      return { data: state.single ? (matches ? person : null) : (matches ? [person] : []), error: null };
    }
    if (table === "person_select_choices") return { data: [], error: null };
    if (table === "person_select_images" && state.countOnly) return { data: null, count: 1, error: null };
    return { data: null, error: null };
  };

  return {
    from(table: string) {
      const state: QueryState = { filters: {}, countOnly: false, single: false, write: false };
      const query = {
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          state.countOnly = options?.count === "exact" && options?.head === true;
          return query;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return query;
        },
        gte() { return query; },
        insert() { state.write = true; return query; },
        update() { state.write = true; return query; },
        maybeSingle() {
          state.single = true;
          return Promise.resolve(resolve(table, state));
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(resolve(table, state)).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
}

function routeContext(slug = EVENT_SLUG) {
  return { params: Promise.resolve({ eventSlug: slug }) };
}

function cookieValue(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(new RegExp(`${PERSON_SELECT_COOKIE}=([^;]+)`))?.[1];
  if (!value) throw new Error("로그인 응답에 세션 쿠키가 없습니다.");
  return value;
}

describe("person select public session flow", () => {
  beforeEach(() => {
    process.env.PERSON_SELECT_SESSION_SECRET = "person-select-session-test-secret";
    getSupabaseAdminMock.mockReset();
    getSupabaseAdminMock.mockReturnValue(createSupabaseMock());
  });

  it("sends the login cookie to /me and keeps the session after a refresh", async () => {
    const loginResponse = await login(new NextRequest(`http://localhost/api/pick/${EVENT_SLUG}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "최동기", pin: "0420" }),
    }), routeContext());

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("set-cookie")).toContain("Path=/");
    const cookie = `${PERSON_SELECT_COOKIE}=${cookieValue(loginResponse)}`;

    const firstMe = await me(new NextRequest(`http://localhost/api/pick/${EVENT_SLUG}/me`, {
      headers: { cookie },
    }), routeContext());
    const refreshedMe = await me(new NextRequest(`http://localhost/api/pick/${EVENT_SLUG}/me`, {
      headers: { cookie },
    }), routeContext());

    expect(firstMe.status).toBe(200);
    expect(await firstMe.json()).toMatchObject({ ok: true, person: { display_name: "최동기", group_label: "4반" } });
    expect(refreshedMe.status).toBe(200);
  });

  it("rejects a valid session when its event id does not match the requested slug", async () => {
    const token = createPersonSelectSession(PERSON_ID, OTHER_EVENT_ID);
    const response = await me(new NextRequest(`http://localhost/api/pick/${EVENT_SLUG}/me`, {
      headers: { cookie: `${PERSON_SELECT_COOKIE}=${token}` },
    }), routeContext());

    expect(response.status).toBe(401);
  });

  it("deletes the shared-path cookie from the root path", async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${PERSON_SELECT_COOKIE}=;`);
    expect(response.headers.get("set-cookie")).toContain("Path=/");
  });
});
