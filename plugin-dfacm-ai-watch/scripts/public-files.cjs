'use strict';

// Both the Git export and release archive use exact file lists. Never recurse
// through a directory that might also contain local credentials or evidence.
const { RUNTIME_FILES } = require('./deployment.cjs');

const RELEASE_FILES = Object.freeze([
    ...RUNTIME_FILES,
    'memory.cjs', 'demo.cjs', 'preview.cjs', 'README.md', 'LICENSE', 'PRIVACY.md', 'SECURITY.md',
    '.gitignore', '.gitattributes', '.env.example',
    'scripts/check-build.cjs', 'scripts/check-live.cjs', 'scripts/check-native.cjs',
    'scripts/deployment.cjs', 'scripts/install.sh', 'scripts/rollback.sh', 'scripts/package.cjs',
    'scripts/public-files.cjs', 'scripts/check-public.cjs',
    'tests/detector.test.cjs', 'tests/http.test.cjs', 'tests/store-engine.test.cjs',
    'tests/deployment.test.cjs', 'tests/public-source.test.cjs',
]);
const PUBLIC_FILES = Object.freeze([...RELEASE_FILES, '.github/workflows/ci.yml']);

module.exports = { RELEASE_FILES, PUBLIC_FILES };
