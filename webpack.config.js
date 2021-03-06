const path = require('path');

module.exports = {
  target: 'node',
  mode: 'development',
  //mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js'
  },
  devServer: {
    index: 'default.html',
    contentBase: path.join(__dirname, "."),
    compress: true,
    port: 8080
  },
  devtool: 'eval-source-map',
  plugins: [
  ]
};
