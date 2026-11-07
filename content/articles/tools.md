# Tools: Base64 and Convert

Two local helpers on the **Tools** screen. Nothing you paste or open there leaves this computer.

The same screen has **Authenticator** and **Virtual disks** tabs, each with its own article.

## Base64

- **Encode** text or a file, or **Decode** Base64 back to text.
- **Alphabet**: standard, URL-safe (`-` and `_`) or MIME, which wraps lines at 76 characters.
- **Padding** can be turned off for encoders that expect no `=` at the end.
- **Text encoding**: UTF-8, UTF-16 LE or Latin-1, for both directions.
- **Strict decoding** rejects anything outside the alphabet and names the exact position of the first problem. Turn it off to skip spaces and line breaks and accept either alphabet.
- **As data: URL** wraps the output as `data:<type>;base64,...`. Pasting a `data:` URL into Decode reads it back.

Every encode is checked by decoding it again and comparing SHA-256 hashes; the result says **SHA-256 round trip verified**. Decoded data that is not valid text is shown as hexadecimal and cannot be saved as text.

**Recent conversions** keeps this session's inputs, so **Restore input** brings any of them back.

## Files beside their originals

Under Input and Output, two drop targets work on files where they already are. Drop files on a target or press **Choose files**.

- **Encode to a .txt beside the file** writes the Base64 of each file into the same folder, keeping the whole name: `report.pdf` becomes `report.pdf.base64.txt`.
- **Decode a .txt back to its file** writes the original file next to the text. The name and extension come from the text's name first (`report.pdf.base64.txt` or `report.pdf.b64` gives `report.pdf`), then from a `data:` URL's type, then from the file's first bytes (PNG, JPEG, PDF, ZIP, MP4 and other common types). Only when none of those works is the file saved as `.bin`. Each result says which one was used.
- **Nothing is ever overwritten.** If the name is taken, the number goes before the extension, so it survives a round trip: `report (1).pdf.base64.txt` decodes to `report (1).pdf`. The original files are never moved or changed.
- Both targets use the **Alphabet**, **Padding** and **Strict decoding** settings above. Line breaks inside a Base64 file are always fine; strict decoding still rejects anything else outside the alphabet and names its exact position, and then nothing is written.
- Large files are read and written in pieces, so memory stays flat. Progress shows where the work started, with **Pause**, **Resume** and **Cancel**. Cancelling, or any problem, removes only the file that run was writing.
- Every written file is checked before it is reported: an encoded file is decoded again and its SHA-256 compared with the original, and a decoded file is read back and compared with what was decoded.
- **Show in folder** opens the folder with the new file selected. Folders cannot be dropped; only files are converted.

## Convert

Turn a JSON list of objects, CSV or TSV into CSV, TSV, Markdown or JSON. Before you copy or save, the screen says what the conversion cannot carry, for example that numbers become plain text or that nested objects are written as JSON text in one cell.

## Not built yet

Streaming very large text in the Input box, a preview of decoded files, ZIP export and YAML are planned.

Related: virtual-disks, authenticator, getting-around, sessions, accessibility
