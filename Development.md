# Publishing

- Bump the version in package.json (either manually or using `npm version patch`)
- Commit & push to github
- Create a new release on github with a new tag corresponding to the version in package.json

```
rm -rf dist
npm run build
npm login
npm publish
```