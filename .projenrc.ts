import { ProjenTypeScriptProject } from '@gammarers/projen-projects';
const project = new ProjenTypeScriptProject({
  name: 'strict-env-resolver',
  repositoryUrl: 'https://github.com/gammarers-labs/strict-env-resolver.git',
  description: 'Type-safe environment variable getter for Node.js. Reads and parses process.env with specs (string, number, boolean, enum), optional defaults, and structured validation errors when values are missing or invalid.',
  keywords: ['environment', 'variables', 'getter', 'safe', 'env'],
  devDeps: [
    '@gammarers/projen-projects@^0.5.7',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: false,
});
project.synth();