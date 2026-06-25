import { typescript, javascript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'safe-env-getter',
  projenrcTs: true,
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  typescriptVersion: '5.9.x',
  repository: 'https://github.com/gammarers-labs/safe-env-getter.git',
  description: 'Type-safe environment variable getter for Node.js. Reads and parses process.env with specs (string, number, boolean, enum), optional defaults, and structured validation errors when values are missing or invalid.',
  keywords: ['environment', 'variables', 'getter', 'safe', 'env'],
  releaseToNpm: true,
  npmTrustedPublishing: true,
  npmAccess: javascript.NpmAccess.PUBLIC,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
        workflows: github.workflows.AppPermission.WRITE,
      },
    }),
  },
  autoApproveOptions: {
    allowedUsernames: [
      'gammarers-projen-upgrade-bot[bot]',
      'yicr',
    ],
  },
});
project.synth();