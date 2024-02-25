# Extended Task Lists

![image](./static/screenshot.png)

### Features
- 🌟 Render in-progress and won't do task items with their own UI:
  - in-progress syntax: `- [.] In progress`
  - won't do syntax: `- [~] Won't do`
  - Now supports live preview mode (as of release 1.0.4)!
- 🌟 Generate a top-level TODO file by scanning all tasks lists in markdown files
  - Run using the command "Extended Task Lists: Update TODO"

### To use

Simply add an in-progress or won't do task item: 

```markdown
- [ ] Pending
- [.] In progress 
- [~] Won't do
- [x] Done
```

### Development

To get started, set up your local dev environment by following steps 1–3 in the official Obsidian docs for building a plugin: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin#Step+1+Download+the+sample+plugin.

Remember to run `npm run dev` while developing or you won't see your changes in Obsidian.

### Release

To create a release:
```shell
npm version [major|minor|patch]
git tag x.y.z
git push origin --tags
```
