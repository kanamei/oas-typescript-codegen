#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_1 = require("./generate");
const commander = require("commander");
const fs = require("fs");
const generator = new generate_1.Generator();
const options = {
    input: '',
    output: '',
};
commander
    .version('0.1.0')
    .arguments('<cmd> [input oas json] [output directory]')
    .action((input, output) => {
    options.input = input;
    options.output = output;
})
    .parse(process.argv);
if (!options.input) {
    console.error('no input oas json given!');
    process.exit(1);
}
if (!options.output) {
    console.error('no output directory given!');
    process.exit(1);
}
fs.mkdir(options.output, () => {
    generator.generate(options.input, options.output)
        .then(() => {
        console.log('Generated.');
    })
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
});
//# sourceMappingURL=cli.js.map