export const title = (content: string) => ({ title: [{ text: { content: content || "Sin nombre" } }] });
export const richText = (content?: string) => ({ rich_text: content ? [{ text: { content } }] : [] });
export const number = (value?: number) => ({ number: value ?? 0 });
export const checkbox = (value: boolean) => ({ checkbox: value });
export const select = (name?: string) => ({ select: name ? { name } : null });
export const date = (value: string) => ({ date: { start: value } });
export const relation = (id?: string) => ({ relation: id ? [{ id }] : [] });
