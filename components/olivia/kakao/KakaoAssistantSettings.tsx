"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock3,
  Link2,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { C, R, SP } from "@/lib/theme";

type ConnectionState = {
  connected: boolean;
  configured: boolean;
  owner?: { displayName: string; role: string };
  connection?: {
    connected_at?: string;
    last_received_at?: string;
    last_sent_at?: string;
  } | null;
};

type NotificationSettings = {
  morning_enabled: boolean;
  morning_time: string;
  afternoon_enabled: boolean;
  afternoon_time: string;
  evening_enabled: boolean;
  evening_time: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  kakao_enabled: boolean;
};

type ActionItem = {
  id: string;
  source_channel: string;
  action_name: string;
  status: string;
  created_at: string;
  error_message?: string | null;
};

type GoogleState = {
  connected: boolean;
  credential?: {
    account_email?: string;
    connected_at?: string;
  } | null;
};

const cardStyle = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.xl,
  padding: 20,
  minWidth: 0,
} as const;

const buttonStyle = {
  border: 0,
  borderRadius: R.md,
  padding: "10px 14px",
  font: "inherit",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
} as const;

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
}

export default function KakaoAssistantSettings() {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [google, setGoogle] = useState<GoogleState | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [utterance, setUtterance] = useState("오늘 일정 알려줘");
  const [simulatorResult, setSimulatorResult] = useState("");
  const [simulatorActionId, setSimulatorActionId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [
      connectionResponse,
      settingsResponse,
      actionsResponse,
      googleResponse,
    ] =
      await Promise.all([
        fetch("/api/kakao/link", { cache: "no-store" }).then((res) =>
          res.json(),
        ),
        fetch("/api/assistant/settings", { cache: "no-store" }).then((res) =>
          res.json(),
        ),
        fetch("/api/assistant/actions?limit=20", { cache: "no-store" }).then(
          (res) => res.json(),
        ),
        fetch("/api/assistant/google/status", { cache: "no-store" }).then(
          (res) => res.json(),
        ),
      ]);
    if (connectionResponse.ok) setConnection(connectionResponse);
    if (settingsResponse.ok) setSettings(settingsResponse.settings);
    if (actionsResponse.ok) setActions(actionsResponse.actions ?? []);
    if (googleResponse.ok) setGoogle(googleResponse);
  }, []);

  useEffect(() => {
    void load().catch(() =>
      setMessage({ ok: false, text: "카카오 설정을 불러오지 못했습니다." }),
    );
  }, [load]);

  const issueCode = async () => {
    if (busy) return;
    setBusy("code");
    setMessage(null);
    try {
      const response = await fetch("/api/kakao/link", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setLinkCode(data.code);
      setLinkExpiresAt(data.expiresAt);
      setMessage({
        ok: true,
        text: "카카오톡에서 아래 연결 명령을 입력해 주세요.",
      });
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error ? error.message : "연결 코드 발급 실패",
      });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/kakao/link", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setLinkCode("");
      setMessage({ ok: true, text: "카카오 연결을 해제했습니다." });
      await load();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "연결 해제 실패",
      });
    } finally {
      setBusy("");
    }
  };

  const updateSettings = async (
    patch: Partial<NotificationSettings>,
  ) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const response = await fetch("/api/assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setSettings(data.settings);
      setMessage({ ok: true, text: "알림 설정을 저장했습니다." });
    } catch (error) {
      setSettings(previous);
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "알림 설정 저장 실패",
      });
    }
  };

  const simulate = async () => {
    if (!utterance.trim() || busy) return;
    setBusy("simulate");
    setSimulatorResult("");
    setSimulatorActionId("");
    try {
      const response = await fetch("/api/kakao/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance,
          requestId: `ui-${crypto.randomUUID()}`,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setSimulatorResult(data.text || "처리했습니다.");
      if (data.kind === "confirmation") {
        setSimulatorActionId(data.actionRequestId);
      }
      await load();
    } catch (error) {
      setSimulatorResult(
        error instanceof Error ? error.message : "시뮬레이션 실패",
      );
    } finally {
      setBusy("");
    }
  };

  const decideAction = async (decision: "confirm" | "cancel") => {
    if (!simulatorActionId || busy) return;
    setBusy(decision);
    try {
      const response = await fetch(
        `/api/assistant/actions/${simulatorActionId}/${decision}`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setSimulatorResult(
        decision === "confirm"
          ? data.message || "승인 후 실행했습니다."
          : "요청을 취소했습니다.",
      );
      setSimulatorActionId("");
      await load();
    } catch (error) {
      setSimulatorResult(
        error instanceof Error ? error.message : "Action 처리 실패",
      );
    } finally {
      setBusy("");
    }
  };

  const statusColor = connection?.connected ? C.success : C.hint;

  return (
    <div
      style={{
        display: "grid",
        gap: SP.lg,
        fontFamily: "inherit",
        color: C.ink,
      }}
    >
      {message ? (
        <div
          role="status"
          style={{
            padding: "10px 13px",
            borderRadius: R.md,
            background: message.ok ? "#E5F4ED" : "#FFF0EC",
            color: message.ok ? C.success : C.danger,
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: SP.lg,
        }}
      >
        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  color: C.muted,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                KAKAO CONNECTION
              </p>
              <h2 style={{ margin: 0, fontSize: 18 }}>대표자 카카오 연결</h2>
            </div>
            <span
              style={{
                borderRadius: 999,
                padding: "6px 9px",
                background: `${statusColor}18`,
                color: statusColor,
                fontSize: 11,
                fontWeight: 850,
              }}
            >
              {connection?.connected ? "연결됨" : "연결 전"}
            </span>
          </div>
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: R.lg,
              background: C.mint,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <div>
              <strong>카카오 개발 설정</strong>{" "}
              {connection?.configured ? "준비됨" : "환경변수 미설정"}
            </div>
            <div>
              <strong>연결 시각</strong>{" "}
              {formatDate(connection?.connection?.connected_at)}
            </div>
            <div>
              <strong>마지막 수신</strong>{" "}
              {formatDate(connection?.connection?.last_received_at)}
            </div>
          </div>
          {linkCode ? (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: R.lg,
                border: `1px dashed ${C.sage}`,
                background: C.white,
              }}
            >
              <strong style={{ display: "block", fontSize: 14 }}>
                올리비아 연결 {linkCode}
              </strong>
              <small style={{ color: C.muted }}>
                {formatDate(linkExpiresAt)}까지 유효
              </small>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => void issueCode()}
              disabled={Boolean(busy)}
              style={{
                ...buttonStyle,
                background: C.teal,
                color: C.white,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Link2 size={14} /> 연결 코드 발급
            </button>
            {connection?.connected ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={Boolean(busy)}
                style={{
                  ...buttonStyle,
                  background: "#F4F0EA",
                  color: C.muted,
                }}
              >
                <Unlink size={14} /> 연결 해제
              </button>
            ) : null}
          </div>
        </section>

        <section style={cardStyle}>
          <p
            style={{
              margin: "0 0 6px",
              color: C.muted,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            BRIEFING
          </p>
          <h2 style={{ margin: "0 0 15px", fontSize: 18 }}>알림과 브리핑</h2>
          {settings ? (
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["morning", "아침 브리핑", "morning_enabled", "morning_time"],
                [
                  "afternoon",
                  "오후 브리핑",
                  "afternoon_enabled",
                  "afternoon_time",
                ],
                ["evening", "저녁 브리핑", "evening_enabled", "evening_time"],
              ].map((item) => {
                const enabledKey = item[2] as keyof NotificationSettings;
                const timeKey = item[3] as keyof NotificationSettings;
                return (
                  <label
                    key={item[0]}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 750 }}>{item[1]}</span>
                    <input
                      type="time"
                      value={String(settings[timeKey]).slice(0, 5)}
                      onChange={(event) =>
                        void updateSettings({
                          [timeKey]: event.target.value,
                        })
                      }
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: R.sm,
                        padding: "7px 8px",
                        font: "inherit",
                      }}
                    />
                    <input
                      type="checkbox"
                      checked={Boolean(settings[enabledKey])}
                      onChange={(event) =>
                        void updateSettings({
                          [enabledKey]: event.target.checked,
                        })
                      }
                    />
                  </label>
                );
              })}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingTop: 10,
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                카카오 알림 수신
                <input
                  type="checkbox"
                  checked={settings.kakao_enabled}
                  disabled={!connection?.connected}
                  onChange={(event) =>
                    void updateSettings({
                      kakao_enabled: event.target.checked,
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 12 }}>설정을 불러오는 중입니다.</p>
          )}
        </section>
      </div>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 5px",
                color: C.muted,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              SKILL SIMULATOR
            </p>
            <h2 style={{ margin: 0, fontSize: 18 }}>카카오 명령 테스트</h2>
          </div>
          <span style={{ color: C.muted, fontSize: 11 }}>
            실제 카카오 연결 전 공통 Core 검증
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 8,
          }}
        >
          <input
            value={utterance}
            onChange={(event) => setUtterance(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void simulate();
            }}
            placeholder="오늘 일정 알려줘"
            style={{
              width: "100%",
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              padding: "11px 13px",
              font: "inherit",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={() => void simulate()}
            disabled={Boolean(busy)}
            style={{
              ...buttonStyle,
              background: C.orange,
              color: C.white,
              minWidth: 88,
            }}
          >
            {busy === "simulate" ? (
              <RefreshCw size={14} />
            ) : (
              <Send size={14} />
            )}
            전송
          </button>
        </div>
        {simulatorResult ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: R.lg,
              background: C.mint,
              whiteSpace: "pre-wrap",
              lineHeight: 1.65,
              fontSize: 13,
            }}
          >
            {simulatorResult}
            {simulatorActionId ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => void decideAction("confirm")}
                  style={{
                    ...buttonStyle,
                    background: C.teal,
                    color: C.white,
                  }}
                >
                  <Check size={14} /> 진행
                </button>
                <button
                  type="button"
                  onClick={() => void decideAction("cancel")}
                  style={{
                    ...buttonStyle,
                    background: C.white,
                    color: C.muted,
                  }}
                >
                  취소
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 5px",
                color: C.muted,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              GOOGLE MAIL
            </p>
            <h2 style={{ margin: 0, fontSize: 18 }}>대표자 이메일 연결</h2>
            <p
              style={{
                margin: "7px 0 0",
                color: C.muted,
                fontSize: 12,
              }}
            >
              {google?.connected
                ? `${google.credential?.account_email || "Google 계정"} 연결됨`
                : "중요 메일 조회·요약·답장 초안을 위해 별도 동의가 필요합니다."}
            </p>
          </div>
          <a
            href="/api/assistant/google/connect"
            style={{
              ...buttonStyle,
              background: google?.connected ? C.mint : C.teal,
              color: google?.connected ? C.teal : C.white,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <Link2 size={14} />
            {google?.connected ? "다시 연결" : "Google 연결"}
          </a>
        </div>
      </section>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 5px",
                color: C.muted,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              ACTION HISTORY
            </p>
            <h2 style={{ margin: 0, fontSize: 18 }}>실행·승인 기록</h2>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            style={{ ...buttonStyle, background: C.mint, color: C.teal }}
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
        {actions.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {actions.map((action) => (
              <article
                key={action.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 11px",
                  border: `1px solid ${C.border}`,
                  borderRadius: R.md,
                }}
              >
                {action.status === "waiting_confirmation" ? (
                  <Clock3 size={16} color={C.gold} />
                ) : action.status === "completed" ? (
                  <ShieldCheck size={16} color={C.success} />
                ) : (
                  <MessageCircleMore size={16} color={C.sage} />
                )}
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 12 }}>
                    {action.action_name}
                  </strong>
                  <small style={{ color: C.muted }}>
                    {action.source_channel} · {formatDate(action.created_at)}
                  </small>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 850,
                    color:
                      action.status === "completed"
                        ? C.success
                        : action.status === "failed"
                          ? C.danger
                          : C.gold,
                  }}
                >
                  {action.status}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
            아직 실행 기록이 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}
