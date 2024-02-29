import {build as esBuild} from 'esbuild'
import cleanBundledDependencies from '../../../bin/clean-bundled-dependencies.js'

const external = [
  'react-devtools-core',  // react-devtools-core can't be bundled (part of ink)
  'yoga-wasm-web', // yoga-wasm-web can't be bundled (part of ink)
  'stacktracey',
  '@shopify/plugin-cloudflare',
  'esbuild',
  '@luckycatfactory/esbuild-graphql-loader',
  '@shopify/plugin-did-you-mean' // Plugins need to be external so that they can be loaded dynamically
]

await esBuild({
  bundle: true,
  entryPoints: ['./src/**/*.ts'],
  outdir: './dist',
  platform: 'node',
  format: 'esm',
  inject: ['../../bin/cjs-shims.js'],
  external,
  loader: {'.node': 'copy'},
  splitting: true,
  plugins: [],
})

await cleanBundledDependencies(external)
