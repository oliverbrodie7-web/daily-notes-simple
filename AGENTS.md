<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history (force pushing, or rebasing/amending/squashing commits
> that are already pushed) as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Migration documents

The parent tracker migration into this app is guided by three files in the
repo root: janice-claude-code-brief.md (business rules, schema, landmines),
janice-tracker-extraction-roadmap.md (the phased delivery plan), and
CODE-MAP.md (the app map plus the gaps found between the code and those
documents). Read all three before changing tracker code. The strict P2 rule
lives in src/lib/p2.ts and must not be loosened: a student is P2 done only
if their most recent contact_log entry is FULL P2 with Reached or Low Risk
Parent with Noted. This project never uses em dashes or en dashes anywhere.
