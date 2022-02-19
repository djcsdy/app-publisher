//@ts-check

'use strict';

const path = require('path');
const exec = require('child_process').exec;
const ShebangPlugin = require('webpack-shebang-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const nodeExternals = require("webpack-node-externals");


/**
 * @type {import('webpack').Configuration}
 */
const config =
{   
	target: 'node', 
	// externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
	//
	// entry: './src/bin/app-publisher.ts',
	entry: {
        'app-publisher': './src/bin/app-publisher.ts'
        //cli: './src/cli.ts',
        //index: './src/index.ts'
    },
	output:
	{   //
		// the bundle is stored in the 'dist' folder (check package.json), -> https://webpack.js.org/configuration/output/
		//
		path: path.resolve(__dirname, 'build'),
		// filename: 'app-publisher.js',
		filename: '[name].js',
		libraryTarget: 'commonjs',
		devtoolModuleFilenameTemplate: '../[resource-path]'
	},
	devtool: 'source-map',
	externals: [
		// @ts-ignore
		nodeExternals()
	],
	// externals: [nodeExternals({
    //     allowlist: ['jquery', 'webpack/hot/dev-server', /^lodash/]
    // })],
	resolve:
	{   //
		// support reading TypeScript and JavaScript files, -> https://github.com/TypeStrong/ts-loader
		//
		extensions: ['.ts', '.js']
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: [/node_modules/, /test^/,/bin/],
			use: [{
				loader: 'ts-loader'
			}]
		}]
	},
	plugins: [
		new ShebangPlugin()
	],
	optimization: {
		minimize: true,
		minimizer: [
			new TerserPlugin({ 
				extractComments: false ,
				parallel: true,
				terserOptions: {
					ecma: undefined,
					parse: {},
					compress: {},
					mangle: true, // Note `mangle.properties` is `false` by default.
					module: false,
					// Deprecated
					output: null,
					format: null,
					toplevel: false,
					nameCache: null,
					ie8: false,
					keep_classnames: undefined,
					keep_fnames: false,
					safari10: false,
				}
			})
		]
	}
};
module.exports = config;