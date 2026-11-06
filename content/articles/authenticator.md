# Authenticator

Two-step sign-in codes, made on this computer.

Open **Tools › Authenticator**, or search the palette (**Ctrl+Shift+F**) for *Authenticator*.

## Add an account

Choose **Add account**. Then do one of these:

- Paste the whole `otpauth://totp/...` link that a website shows under its QR code.
- Paste only the secret key, then fill in the name, the issuer and the code settings. Most sites use SHA-1, 6 digits and 30 seconds.

Spaces and dashes in a secret are ignored. A secret that is not valid Base32 is rejected, and the message names the problem.

## Using codes

Each account shows its current code, a ring that empties as the code expires, and the next code. Select the code or **Copy** to copy it without spaces. The ring turns red in the last five seconds.

Search the list by name or issuer. The regex builder works here as it does everywhere else.

## Where secrets are kept

Secrets are encrypted with your operating system's protected storage before they are saved: Windows DPAPI, the macOS Keychain or the Linux secret service. Only the name, issuer and code settings are saved in plain form. When that storage is unavailable, adding accounts is turned off and the screen says why.

## Export

- **Export list** saves names, issuers and code settings. It never includes secrets, and the file says so.
- **Export with secrets** saves full `otpauth://` links. It asks for a two-step confirmation first, because anyone with that file can make your codes. Keep it somewhere safe and delete it when you are done.

Removing an account also asks for confirmation. A removed secret cannot be recovered from this app.

Related: tools, safety, search-and-regex
