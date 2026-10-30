import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

export default {
	input: 'src/plugin.ts',
	output: {
		file: 'com.haeunga0822.rme-totalmix.sdPlugin/bin/plugin.js',
		format: 'es',
		sourcemap: true,
	},
	plugins: [
		typescript({ outDir: 'com.haeunga0822.rme-totalmix.sdPlugin/bin', declaration: false }),
		nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
		commonjs(),
	],
	external: [/^node:/],
}
