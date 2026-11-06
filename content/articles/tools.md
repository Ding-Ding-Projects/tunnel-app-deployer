# Tools: Base64 and Convert

Two local helpers on the **Tools** screen. Nothing you paste or open there leaves this computer.

## Base64

- **Encode** text or a file, or **Decode** Base64 back to text.
- **Alphabet**: standard, URL-safe (`-` and `_`) or MIME, which wraps lines at 76 characters.
- **Padding** can be turned off for encoders that expect no `=` at the end.
- **Text encoding**: UTF-8, UTF-16 LE or Latin-1, for both directions.
- **Strict decoding** rejects anything outside the alphabet and names the exact position of the first problem. Turn it off to skip spaces and line breaks and accept either alphabet.
- **As data: URL** wraps the output as `data:<type>;base64,...`. Pasting a `data:` URL into Decode reads it back.

Every encode is checked by decoding it again and comparing SHA-256 hashes; the result says **SHA-256 round trip verified**. Decoded data that is not valid text is shown as hexadecimal and cannot be saved as text.

**Recent conversions** keeps this session's inputs, so **Restore input** brings any of them back.

## Convert

Turn a JSON list of objects, CSV or TSV into CSV, TSV, Markdown or JSON. Before you copy or save, the screen says what the conversion cannot carry, for example that numbers become plain text or that nested objects are written as JSON text in one cell.

## Not built yet

Streaming very large files with pause and cancel, MIME type detection with a preview, ZIP export and YAML are planned.

Related: getting-around, sessions, accessibility
