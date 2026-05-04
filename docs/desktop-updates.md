# Desktop Updates

The desktop app uses Tauri's signed updater on Windows and macOS. Release builds publish installer assets plus `latest.json` to GitHub Releases, and the app's **Updates** button checks that file.

## One-Time Setup

1. Add these GitHub repository secrets:

   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if the private key has a password

2. Use the generated private key at `/private/tmp/wvcs-scheduler-update.key` for `TAURI_SIGNING_PRIVATE_KEY`.

3. This key was generated without a password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can be left unset. If you later generate a password-protected key, add that password as the secret value and replace the public key in `src-tauri/tauri.conf.json`.

Do not commit the private key. If the private key is lost, already-installed apps cannot trust future updates.

## Publishing an Update

1. Update `src-tauri/tauri.conf.json` version, for example from `0.1.0` to `0.2.0`.
2. Commit and push the version change.
3. Create and push a matching tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. GitHub Actions will run `Release Desktop App`.
5. The release will include Windows and macOS installers/update bundles, signatures, and `latest.json`.

Installed apps can then use the **Updates** button.

## Important

The updater endpoint is:

```text
https://github.com/ChristianInfluence/school-scheduler/releases/latest/download/latest.json
```

That endpoint must be reachable from the installed app. If this repository is private, either make release assets publicly reachable or move update assets to a public hosting location such as Cloudflare R2, S3, or a small update server.
