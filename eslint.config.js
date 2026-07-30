import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'

export default [
  { ignores: resolveIgnoresFromGitignore() },
  ...neostandard({ ts: true }),
  {
    rules: {
      // src is written without the space; standard's default would rewrite every function in it.
      '@stylistic/space-before-function-paren': ['error', 'never']
    }
  }
]
