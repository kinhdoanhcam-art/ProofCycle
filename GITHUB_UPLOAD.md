# GitHub upload checklist

Push:

```text
api/
contract/
public/
src/
tests/
.env.example
.gitignore
FRONTEND_TESTING.md
GITHUB_UPLOAD.md
README.md
SUBMISSION_NOTE.md
TESTING.md
index.html
package-lock.json
package.json
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vercel.json
vite.config.ts
```

Do not push:

```text
node_modules/
dist/
.env
.env.local
.vercel/
*.tsbuildinfo
__pycache__/
```

Before push, confirm no internal audit or Claude prompt is present in the public repository.
