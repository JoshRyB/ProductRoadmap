# Putting the roadmap online

This guide gets a private copy of the roadmap online, protected by a password, so you and a few colleagues can open it from anywhere. It is written for someone who hasn't hosted anything before. It uses [Render](https://render.com), chosen because it is the simplest to set up, which means the fewest chances to get a security setting wrong. Any host that runs Docker works the same way.

> Button names on Render's site may differ a little from what's written here. Check Render's current pricing page before you start: free instances go to sleep when nobody has used them for a while, and the first visit after that is slow.

## What you get, and what you don't

**What it protects**
- Nobody can see your roadmap, or any file of the app, without the password. Without it the server shows only a sign-in page.
- The server **refuses to start** if it would be online with real work data and no password, or with a weak one.
- Your Jira or Azure DevOps token lives only in the host's settings. It is never in the code, the image, or the browser.
- Everything travels over HTTPS. The sign-in cookie can't be read by scripts, is never sent from other sites, and expires after 12 hours.
- Guessing is slowed down: five wrong attempts and the address is locked out for 15 minutes.
- The server uses no third-party packages at all, so there are no hidden libraries to go out of date.
- The app only reads. It can't change anything in Jira or Azure DevOps.

**What it doesn't do (yet)**
- It is **one shared password**, not individual accounts. Anyone who has the password sees the roadmap, and you can't tell them apart. Individual sign-in with each person's own Jira or Microsoft login comes later.
- Whoever signs in sees whatever the token you gave it can see. Use a token with the least access that works, and don't point this at confidential client projects unless the client agrees.
- It has not been through an independent security review. Treat it as suitable for a small trusted group, not the public.

## Before you start

1. **Turn on two-step sign-in** (2FA) for GitHub and for Render once you have an account. If someone takes over either account, they can read your settings.
2. **Choose the password** (`ACCESS_PASSWORD`). Use at least 12 characters, ideally four or more unrelated words, and make it one you use nowhere else. Store it in a password manager. Don't send it by email or chat; tell people in person or by phone.
3. **Make a read-only token** for the tool you use:
   - **Jira:** an API token for an account that can only view the project.
   - **Azure DevOps:** a personal access token with only **Work Items: Read** and **Project and Team: Read**, with the shortest expiry you're happy to renew (for example 90 days).
4. **Create the lock file.** On your Mac, in the project folder, run `npm install`. This writes `package-lock.json`, which pins exact versions so the online copy is built the same as yours. Then:
   ```bash
   git add package-lock.json
   git commit -m "Add lock file"
   git push
   ```

## Steps on Render

1. Go to [render.com](https://render.com) and sign up with your GitHub account. Turn on 2FA.
2. In the dashboard choose **New**, then **Blueprint**.
3. Connect your GitHub account when asked, and pick the `ProductRoadmap` repository. Render reads the `render.yaml` file in it, which describes the service.
4. Render now asks for the settings marked as secrets. Fill in:
   - `ACCESS_PASSWORD`: the password you chose.
   - The settings for **one** tool, and leave the others empty:
     - Jira: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`
     - Azure DevOps: `ADO_ORG_URL`, `ADO_PROJECT`, `ADO_PAT`
   - `SESSION_SECRET` and `TRUST_PROXY` are filled in for you.
5. Apply. Render builds and starts the app, which takes a few minutes. When it's done you get an address like `https://product-roadmap-xxxx.onrender.com`.

If you prefer, create a **Web Service** instead: choose your repository, pick the **Docker** runtime, and add the same settings by hand under **Environment**. Also set `TRUST_PROXY` to `1` and make `SESSION_SECRET` a long random value (run `openssl rand -hex 32` on your Mac to make one).

## Check it is locked

1. Open your address in a private browser window. You should see **only a sign-in page**, and a padlock in the address bar.
2. Add `/api/roadmap` to the end of the address. You should see `Sign in required`, not any roadmap data.
3. Sign in with the password. You should see your roadmap.
4. Use your name menu (top right) to **Sign out**, and check you land back on the sign-in page.

If step 1 shows the roadmap without asking for a password, **delete the service straight away** and tell me.

## Looking after it

- **Rotate the token** before it expires, and straight away if you think it leaked. Update it in Render's **Environment** page. Anything pasted into a chat or email counts as leaked.
- **Change the password** by editing `ACCESS_PASSWORD` in Render. Everyone is signed out when it changes.
- **Updates:** pushing to GitHub redeploys automatically.
- **Take it down** whenever you like by suspending or deleting the service.
- **Don't** put tokens or passwords in the code, in `render.yaml`, or in messages. They belong only in Render's **Environment** page.

## Settings you may need

| Setting | What it does |
| --- | --- |
| `ACCESS_PASSWORD` | The shared password. Required online (12+ characters). |
| `SESSION_SECRET` | Signs the sign-in cookie. Required online (32+ random characters). |
| `TRUST_PROXY` | Set to `1` behind a host's HTTPS front door, so the app sees visitors' real addresses and sends plain-HTTP visitors to HTTPS. |
| `ALLOWED_HOSTS` | Optional. Comma-separated host names the app answers to, for example `roadmap.example.com`. |
| `SESSION_HOURS` | Optional. How long a sign-in lasts. Default 12, longest 720. |
| `HOST`, `PORT` | Where the server listens. The image sets `HOST=0.0.0.0`. On your own computer it defaults to `127.0.0.1`, which only your computer can reach. |
| `WEB_ROOT` | Advanced. Folder containing the built web app. |

## If something goes wrong

- **Build fails:** open the service's **Logs** tab and read the last lines. A missing `package-lock.json` is fine (it falls back), but a broken one is not.
- **Logs say `Refusing to start`:** the message says exactly what is missing, for example a password under 12 characters. Fix it under **Environment** and redeploy.
- **"This address isn't served here" (421):** you set `ALLOWED_HOSTS` and the address you are using isn't in it. Add it, or remove the setting.
- **The roadmap shows an error from Jira or Azure DevOps:** the message says why. A sign-in page message usually means the token is wrong or has expired.
- **First visit is slow:** that's a sleeping free instance waking up.

## Running the same image elsewhere

The `Dockerfile` makes a small image that runs as an ordinary (non-root) user and holds no settings. Anywhere that runs containers works: set the same environment variables there and make sure HTTPS is switched on in front of it. The image checks its own health at `/api/health`.
