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
{   //
	// vscode extensions run in a Node.js-context -> https://webpack.js.org/configuration/node/
	//
	target: 'node', 
	//
	// the entry point of this extension, -> https://webpack.js.org/configuration/entry-context/
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
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../[resource-path]'
	},
	devtool: 'source-map',
	// externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
	externals: [
		nodeExternals(),
		{   //
			// the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot
			// be webpack'ed, -> https://webpack.js.org/configuration/externals/
			//
			app: 'commonjs'
		}
	],
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