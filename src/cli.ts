#!/usr/bin/env node

import { Generator } from './generate'
import * as commander from 'commander'
import * as fs from 'fs'

const generator = new Generator()

const options = {
  input: '',
  output: '',
}

commander
  .version('0.1.0')
  .arguments('<cmd> [input oas json] [output directory]')
  .action((input: string, output: string) => {
    options.input = input
    options.output = output
  })
  .parse(process.argv)

if (!options.input) {
  console.error('no input oas json given!')
  process.exit(1)
}

if (!options.output) {
  console.error('no output directory given!')
  process.exit(1)
}

fs.mkdir(options.output, () => {
  generator.generate(options.input, options.output)
  .then(() => {
    console.log('Generated.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
})
