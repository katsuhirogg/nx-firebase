import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  joinPathFragments, // 👈 Make sure this is imported
} from '@nx/devkit'
import type { FunctionGeneratorNormalizedSchema } from '../schema'
import type { FunctionAssetsEntry, FunctionAssetsGlob } from '../../../types'

export function updateProject(
  host: Tree,
  options: FunctionGeneratorNormalizedSchema,
): void {
  const project = readProjectConfiguration(host, options.projectName)
  const firebaseAppProject = options.firebaseAppProject

  // Defensively create the targets object if it doesn't exist.
  project.targets ??= {}

  /**
   * Manually construct the paths. Do not read from project.targets.build
   * as it is no longer created by the base @nx/node generator.
   */
  const outputPath = joinPathFragments('dist', options.projectRoot)
  const main = joinPathFragments(options.projectRoot, 'src', 'main.ts')
  const tsConfig = joinPathFragments(options.projectRoot, 'tsconfig.app.json')
  const assets: FunctionAssetsEntry[] = [
    joinPathFragments(options.projectRoot, 'src', 'assets'),
  ]

  /**
   * Create the build target from scratch with a simplified version.
   * We don't need dev/production build configurations for Firebase Functions.
   */
  project.targets.build = {
    executor: '@nx/esbuild:esbuild',
    outputs: ['{options.outputPath}'],
    options: {
      outputPath, // Use the newly constructed path
      main,       // Use the newly constructed path
      tsConfig,   // Use the newly constructed path
      assets,     // Use the newly constructed assets array
      generatePackageJson: true,
      platform: 'node',
      bundle: true,
      thirdParty: false,
      target: 'node20',
      format: [options.format ?? 'esm'],
      esbuildOptions: {
        logLevel: 'info',
      },
    },
  }

  // Add a reference to the firebase app's environment assets.
  const firebaseAppRoot = firebaseAppProject.root
  const glob: FunctionAssetsGlob = {
    glob: '**/*',
    input: `${firebaseAppRoot}/environment`,
    output: '.',
  }
  project.targets.build.options.assets.push(glob)

  // Add the deploy target.
  project.targets.deploy = {
    executor: 'nx:run-commands',
    options: {
      command: `nx run ${firebaseAppProject.name}:deploy --only functions:${options.projectName}`,
    },
    dependsOn: ['build'],
  }

  // Remove the serve target created by the node generator.
  delete project.targets.serve

  updateProjectConfiguration(host, options.projectName, project)

  // Add the function project as an implicit dependency of the Firebase app project.
  firebaseAppProject.implicitDependencies ||= []
  firebaseAppProject.implicitDependencies.push(options.projectName)
  firebaseAppProject.implicitDependencies.sort()
  updateProjectConfiguration(host, options.app, firebaseAppProject)
}
