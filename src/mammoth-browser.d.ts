// mammoth ships a prebuilt browser bundle alongside its Node entry. The Node
// entry cannot read an ArrayBuffer, which is all a file picker gives you, so
// the bulk upload loads this one instead. It has no types of its own, and
// only the one function is used.
//
// The HTML rather than the plain text, because the plain text throws away
// the soft line breaks inside a table cell and runs a whole student together
// into one line.
declare module "mammoth/mammoth.browser.js" {
  type ConvertResult = { value: string; messages: unknown[] };
  type ConvertOptions = { ignoreEmptyParagraphs?: boolean };
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: ConvertOptions,
  ): Promise<ConvertResult>;
  const mammoth: { convertToHtml: typeof convertToHtml };
  export default mammoth;
}
