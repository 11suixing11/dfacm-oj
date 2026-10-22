'use strict';

const path = require('node:path');
const nunjucks = require('nunjucks');
const markdown = require('markdown-it')({ html: false, linkify: false });
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.resolve(__dirname, '../templates')), { autoescape: true });
// Hydro's sanitized markdown filter returns a string; templates explicitly
// mark that rendered HTML safe while retaining autoescape on raw source.
env.addFilter('markdown', (text) => markdown.render(text || ''));
function render(job) { return env.render('assistant_result.html', { answer: job.answer, source: job.source || [], verdict: job.verdict || '', diagnostic: job.diagnostic || {} }); }
module.exports = { render };
