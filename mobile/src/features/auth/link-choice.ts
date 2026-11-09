/**
 * `OAUTH_LINK_CHOICE_REQUIRED` carries its ticket in the error details
 * (`link_ticket`, `register_allowed`, ...). Kept free of app imports so it
 * runs under `node --test`.
 */
export type LinkChoice = { ticket: string; registerAllowed: boolean };

type Detail = { field?: string; message?: string };

export function linkChoice(details: Detail[] | undefined | null): LinkChoice | null {
  const by = new Map((details ?? []).map((d) => [d.field ?? '', d.message ?? '']));
  const ticket = by.get('link_ticket');
  if (!ticket) return null;
  return { ticket, registerAllowed: by.get('register_allowed') === 'true' };
}
