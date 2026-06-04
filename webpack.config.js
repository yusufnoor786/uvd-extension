const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: {
      'background/service-worker': './src/background/service-worker.ts',
      'content/content-main': './src/content/content-main.ts',
      'content/injected': './src/content/injected.ts',
      'popup/popup': './src/popup/index.tsx',
      'options/options': './src/options/index.tsx',
      'debug/debug': './src/debug/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@background': path.resolve(__dirname, 'src/background'),
        '@content': path.resolve(__dirname, 'src/content'),
        '@popup': path.resolve(__dirname, 'src/popup'),
        '@options': path.resolve(__dirname, 'src/options'),
        '@debug': path.resolve(__dirname, 'src/debug'),
        '@types': path.resolve(__dirname, 'src/types'),
        '@utils': path.resolve(__dirname, 'src/utils'),
      },
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/index.html',
        filename: 'popup/index.html',
        chunks: ['popup/popup'],
      }),
      new HtmlWebpackPlugin({
        template: './src/options/index.html',
        filename: 'options/index.html',
        chunks: ['options/options'],
      }),
      new HtmlWebpackPlugin({
        template: './src/debug/index.html',
        filename: 'debug/index.html',
        chunks: ['debug/debug'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'assets', to: 'assets' },
        ],
      }),
    ],
    optimization: {
      minimize: !isDev,
    },
    devtool: isDev ? 'cheap-module-source-map' : false,
    stats: {
      assets: true,
      modules: false,
      entrypoints: false,
    },
  };
};
