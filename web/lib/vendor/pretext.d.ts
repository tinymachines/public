/**
 * The typed surface of lib/vendor/pretext.js, which scripts/build-pretext.mjs
 * bundles from extern/pretext/src at build time. Only what the site uses is
 * declared; the names and shapes are pretext's own (src/layout.ts and
 * src/rich-inline.ts). lib/pretext.test.ts imports the bundle and checks
 * these names exist, so a rename upstream fails a test rather than a page.
 */

export type LayoutCursor = { segmentIndex: number; graphemeIndex: number };
export type PrepareOptions = { whiteSpace?: "normal" | "pre-wrap"; wordBreak?: "normal" | "keep-all"; letterSpacing?: number };

export interface PreparedText { readonly __pretext: unique symbol }
export interface PreparedTextWithSegments { readonly __pretextSegments: unique symbol }
export type LayoutResult = { height: number; lineCount: number };
export type LayoutLine = { text: string; width: number; start: LayoutCursor; end: LayoutCursor };

export function prepare(text: string, font: string, options?: PrepareOptions): PreparedText;
export function prepareWithSegments(text: string, font: string, options?: PrepareOptions): PreparedTextWithSegments;
export function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult;
export function layoutWithLines(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): LayoutResult & { lines: LayoutLine[] };
export function clearCache(): void;

export type RichInlineItem = { text: string; font: string; letterSpacing?: number; break?: "normal" | "never"; extraWidth?: number };
export interface PreparedRichInline { readonly __pretextRich: unique symbol }
export type RichInlineCursor = { itemIndex: number; segmentIndex: number; graphemeIndex: number };
export type RichInlineFragmentRange = { itemIndex: number; gapBefore: number; occupiedWidth: number; start: LayoutCursor; end: LayoutCursor };
export type RichInlineFragment = RichInlineFragmentRange & { text: string };
export type RichInlineLineRange = { fragments: RichInlineFragmentRange[]; width: number; end: RichInlineCursor };
export type RichInlineLine = { fragments: RichInlineFragment[]; width: number; end: RichInlineCursor };

export function prepareRichInline(items: RichInlineItem[]): PreparedRichInline;
export function walkRichInlineLineRanges(prepared: PreparedRichInline, maxWidth: number, onLine: (line: RichInlineLineRange) => void): number;
export function materializeRichInlineLineRange(prepared: PreparedRichInline, line: RichInlineLineRange): RichInlineLine;
