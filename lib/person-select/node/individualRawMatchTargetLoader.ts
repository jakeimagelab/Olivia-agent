import { resolveIndividualRawMatchTargets } from "@/lib/person-select/rawMatch";
import {
  rawMatchImageRow,
  type ChoiceRow,
  type LoadRawMatchTargetsInput,
  type PersonRow,
} from "@/lib/person-select/node/rawMatchTargetRows";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

export async function loadIndividualRawMatchTargets(input: LoadRawMatchTargetsInput) {
  const [people, choices] = await Promise.all([
    readAllPersonSelectRows<PersonRow>((from, to) => input.db
      .from("person_select_people")
      .select("id,display_name,submitted_at")
      .eq("event_id", input.eventId)
      .order("id")
      .range(from, to)),
    readAllPersonSelectRows<ChoiceRow>((from, to) => input.db
      .from("person_select_choices")
      .select("person_id,image_id,updated_at,person_select_images(id,original_file_name,source_rel_path)")
      .eq("event_id", input.eventId)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: ChoiceRow[] | null; error: { message?: string } | null }>),
  ]);
  const result = resolveIndividualRawMatchTargets({
    source: input.source,
    people: people.map((person) => ({
      id: person.id,
      displayName: person.display_name,
      submittedAt: person.submitted_at,
    })),
    choices: choices.map((choice) => ({
      personId: choice.person_id,
      image: choice.person_select_images
        ? rawMatchImageRow(choice.person_select_images, { markSavedAt: choice.updated_at ?? null })
        : null,
    })),
  });
  return {
    ...result,
    reviewerIds: [] as string[],
    submittedPeople: people.filter((person) => Boolean(person.submitted_at)).length,
    notSubmitted: people
      .filter((person) => !person.submitted_at)
      .map((person) => String(person.display_name)),
  };
}
