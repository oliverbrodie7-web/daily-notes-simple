// mammoth ships a prebuilt browser bundle alongside its Node entry. The Node
// entry cannot read an ArrayBuffer, which is all a file picker gives you, so
// the bulk upload loads this one instead. It has no types of its own, and
// only the one function is used.
declare module "mammoth/mammoth.browser.js" {
  type RawTextResult = { value: string; messages: unknown[] };
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
  const mammoth: { extractRawText: typeof extractRawText };
  export default mammoth;
}
