"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const fs = require("fs");
const toSource = require("tosource");
const pathUtil = require("path");
const eslint_1 = require("eslint");
const json_schema_to_typescript_1 = require("json-schema-to-typescript");
const $RefParser = require("json-schema-ref-parser");
class TemplateStore {
    constructor() {
        this.fileCache = {};
        this.executorCache = {};
    }
    load(path) {
        if (this.fileCache[path]) {
            return this.fileCache[path];
        }
        return this.fileCache[path] = fs.readFileSync(path).toString();
    }
    parse(template) {
        if (this.executorCache[template]) {
            return this.executorCache[template];
        }
        return this.executorCache[template] = lodash_1.template(template);
    }
}
exports.TemplateStore = TemplateStore;
class Evaluator {
    constructor(store = new TemplateStore()) {
        this.store = store;
    }
    evaluate(path, data) {
        const template = this.store.load(path);
        return template.replace(/\/\* \{\{ (.+) \}\} \*\//g, (full, matches) => {
            return this.store.parse(matches)(Object.assign({}, data, { template: (templatePath, templateData) => {
                    return this.evaluate(pathUtil.join(__dirname, '../templates', templatePath), templateData);
                } }));
        });
    }
}
exports.Evaluator = Evaluator;
class Generator {
    constructor() {
        this.refParser = new $RefParser();
        this.methods = ['get', 'head', 'post', 'put', 'patch', 'delete'];
        this.definitionLintOptions = {
            rules: {
                'quotes': ['error', 'single'],
                'no-trailing-spaces': ['error'],
                'indent': ['error', 2],
                'key-spacing': ['error', { beforeColon: false }],
                'comma-dangle': ['error', 'always'],
                'object-curly-newline': ['error', 'always'],
            },
        };
        this.contentType = 'application/json';
    }
    generate(inputFile, outDir) {
        return __awaiter(this, void 0, void 0, function* () {
            this.outDir = outDir;
            yield this.setup();
            const oasRaw = JSON.parse(yield this.loadSpecification(inputFile));
            const oas = (yield this.refParser.dereference(oasRaw));
            const definitions = {};
            const endpoints = [];
            const imports = [];
            for (const path of Object.keys(oas.paths)) {
                const pathDefinition = oas.paths[path];
                for (const method of this.methods) {
                    const operation = pathDefinition[method];
                    if (!operation || !operation.operationId) {
                        continue;
                    }
                    const requestBody = this.extractRequestBody(operation);
                    let requestParameterType;
                    if (requestBody && requestBody.schema) {
                        const requestInterface = yield this.compileInterface(operation.operationId, 'RequestInput', requestBody.schema);
                        imports.push(requestInterface.import);
                        requestParameterType = requestInterface.interfaceName;
                    }
                    const responseBody = this.extractResponseBody(operation);
                    let responseType = '{}';
                    if (responseBody && responseBody.schema) {
                        const responseInterface = yield this.compileInterface(operation.operationId, 'Response', responseBody.schema);
                        imports.push(responseInterface.import);
                        responseType = responseInterface.interfaceName;
                    }
                    definitions[operation.operationId] = {
                        path,
                        method,
                    };
                    const requestParameterArg = requestParameterType ? [`params: ${requestParameterType}`] : [];
                    const args = (path.match(/{\w+}/g) || []).map((section) => {
                        return section.replace(/[{}]/g, '');
                    }).map((arg) => `${arg}: string`).concat(requestParameterArg).join(', ');
                    endpoints.push(Object.assign({}, operation, { responseType,
                        args }));
                }
            }
            const linter = new eslint_1.Linter();
            const definitionsLintResult = linter.verifyAndFix(`(${toSource(definitions)})`, this.definitionLintOptions);
            const evaluator = new Evaluator();
            const source = evaluator.evaluate(pathUtil.join(__dirname, '../templates/api.ts'), {
                imports,
                definitions: definitionsLintResult.output,
                endpoints,
            });
            yield this.copy(pathUtil.join(__dirname, '../templates/base.ts'), pathUtil.join(outDir, './src/base.ts'));
            yield this.output(pathUtil.join(outDir, './src/api.ts'), source);
            yield this.writePackage(oas.info);
        });
    }
    setup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve) => {
                fs.mkdir(pathUtil.join(this.outDir, './src'), () => resolve());
            });
            yield new Promise((resolve) => {
                fs.mkdir(pathUtil.join(this.outDir, './src/schema'), () => resolve());
            });
        });
    }
    copy(source, destination) {
        return new Promise((resolve, reject) => {
            fs.readFile(source, (readError, data) => {
                readError ? reject(readError) : fs.writeFile(destination, data, (err) => {
                    err ? reject(err) : resolve();
                });
            });
        });
    }
    output(filepath, data) {
        return new Promise((resolve, reject) => {
            fs.writeFile(filepath, data, (err) => {
                err ? reject(err) : resolve();
            });
        });
    }
    writePackage(info) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = JSON.stringify({
                name: `${lodash_1.kebabCase(info.title)}-sdk`,
                version: info.version,
                description: `${info.description} (auto generated sdk by kanamei/oas-typescript-codegen)`,
                main: 'src/api.ts',
                private: true,
                dependencies: {
                    axios: 'latest'
                },
            }, null, 2);
            yield new Promise((resolve, reject) => {
                fs.writeFile(pathUtil.join(this.outDir, 'package.json'), content, (err) => {
                    err ? reject(err) : resolve();
                });
            });
        });
    }
    extractRequestBody(operation) {
        if (!operation || !operation.operationId) {
            return undefined;
        }
        const requestBody = operation.requestBody;
        if (!requestBody || !requestBody.content) {
            return undefined;
        }
        const jsonRequestBody = requestBody.content[this.contentType];
        return jsonRequestBody;
    }
    extractResponseBody(operation) {
        if (!operation || !operation.operationId) {
            return undefined;
        }
        const code = Object.keys(operation.responses).find((c) => c[0] === '2');
        const response = (code && operation.responses[code]) || operation.responses.default;
        if (!response || !response.content) {
            return undefined;
        }
        const jsonResponseBody = response.content[this.contentType];
        return jsonResponseBody;
    }
    compileInterface(operationId, type, schema) {
        return __awaiter(this, void 0, void 0, function* () {
            const intrefaceFileName = lodash_1.kebabCase(`${operationId}${type}`);
            const interfaceName = `I${lodash_1.upperFirst(operationId)}${type}`;
            const content = yield json_schema_to_typescript_1.compile(schema, interfaceName, {
                bannerComment: [
                    '// generated by oas-typescript-codegen',
                    '// tslint:disable:array-type',
                ].join('\n'),
                declareExternallyReferenced: false,
                enableConstEnums: true,
                style: {
                    singleQuote: true,
                    semi: false,
                    tabWidth: 2,
                    useTabs: false,
                    trailingComma: 'all',
                    bracketSpacing: true,
                },
            });
            yield new Promise((resolve, reject) => {
                fs.writeFile(pathUtil.join(this.outDir, 'src/schema', `${intrefaceFileName}.ts`), content, (err) => {
                    err ? reject(err) : resolve();
                });
            });
            return {
                interfaceName,
                intrefaceFileName,
                import: `import { ${interfaceName} } from './schema/${intrefaceFileName}'`,
            };
        });
    }
    loadSpecification(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, (err, data) => {
                err ? reject(err) : resolve(data.toString());
            });
        });
    }
}
exports.Generator = Generator;
//# sourceMappingURL=generate.js.map