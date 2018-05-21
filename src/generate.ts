import { template as compile, TemplateExecutor, upperFirst, kebabCase } from 'lodash'
import * as fs from 'fs'
import * as toSource from 'tosource'
import * as pathUtil from 'path'
import { Linter } from 'eslint'
import * as OpenAPI from 'open-api.d.ts'
import { compile as compileInterface } from 'json-schema-to-typescript'
import * as $RefParser from 'json-schema-ref-parser'

export interface IEndpoint extends OpenAPI.IOperationObject {
  args: string
  responseType: string
}

export class TemplateStore {
  public fileCache: { [path: string]: string } = {}
  public executorCache: { [key: string]: TemplateExecutor } = {}

  public load (path: string) {
    if (this.fileCache[path]) {
      return this.fileCache[path]
    }
    return this.fileCache[path] = fs.readFileSync(path).toString()
  }

  public parse (template: string) {
    if (this.executorCache[template]) {
      return this.executorCache[template]
    }
    return this.executorCache[template] = compile(template)
  }
}

export class Evaluator {
  public store: TemplateStore

  constructor (store = new TemplateStore()) {
    this.store = store
  }

  public evaluate (path: string, data: any) {
    const template = this.store.load(path)
    return template.replace(/\/\* \{\{ (.+) \}\} \*\//g, (full: string, matches: string) => {
      return this.store.parse(matches)({
        ...data,
        template: (templatePath: string, templateData: any) => {
          return this.evaluate(pathUtil.join(__dirname, '../templates', templatePath), templateData)
        },
      })
    })
  }
}

export class Generator {
  public refParser = new $RefParser()
  public methods = ['get', 'head', 'post', 'put', 'patch', 'delete']
  public definitionLintOptions = {
    rules: {
      'quotes': ['error', 'single'],
      'no-trailing-spaces': ['error'],
      'indent': ['error', 2],
      'key-spacing': ['error', { beforeColon: false }],
      'comma-dangle': ['error', 'always'],
      'object-curly-newline': ['error', 'always'],
    },
  }
  public outDir: string
  public contentType = 'application/json'

  public async generate (inputFile: string, outDir: string) {
    this.outDir = outDir
    await this.setup()

    const oasRaw: OpenAPI.IOpenApiObject = JSON.parse(await this.loadSpecification(inputFile))
    const oas = (await this.refParser.dereference(oasRaw)) as OpenAPI.IOpenApiObject

    const definitions = {}
    const endpoints: IEndpoint[] = []
    const imports: string[] = []

    for (const path of Object.keys(oas.paths)) {
      const pathDefinition: OpenAPI.IPathItemObject = oas.paths[path]

      for (const method of this.methods) {
        const operation: OpenAPI.IOperationObject = pathDefinition[method]
        if (!operation || !operation.operationId) {
          continue
        }

        const requestBody = this.extractRequestBody(operation)
        let requestParameterType: string | undefined

        const requestParameters = this.extractRequestParameters(operation)

        if (requestBody && requestBody.schema) {
          const requestInterface = await this.compileInterface(operation.operationId, 'RequestInput', requestBody.schema)
          imports.push(requestInterface.import)
          requestParameterType = requestInterface.interfaceName
        } else if (requestParameters && requestParameters.schema) {
          const requestInterface = await this.compileInterface(operation.operationId, 'RequestInput', requestParameters.schema)
          imports.push(requestInterface.import)
          requestParameterType = requestInterface.interfaceName
        }

        const responseBody = this.extractResponseBody(operation)
        let responseType = '{}'

        if (responseBody && responseBody.schema) {
          const responseInterface = await this.compileInterface(operation.operationId, 'Response', responseBody.schema)
          imports.push(responseInterface.import)
          responseType = responseInterface.interfaceName
        }

        definitions[operation.operationId] = {
          path,
          method,
        }

        const requestParameterArg = requestParameterType ? [`params: ${requestParameterType}`] : []

        const args = (path.match(/{\w+}/g) || []).map((section) => {
          return section.replace(/[{}]/g, '')
        }).map((arg) => `${arg}: string`).concat(requestParameterArg).join(', ')

        endpoints.push({
          ...operation,
          responseType,
          args,
        })
      }
    }

    const linter = new Linter()
    const definitionsLintResult = linter.verifyAndFix(`(${toSource(definitions)})`, this.definitionLintOptions)

    const evaluator = new Evaluator()
    const source = evaluator.evaluate(pathUtil.join(__dirname, '../templates/api.ts'), {
      imports,
      definitions: definitionsLintResult.output,
      endpoints,
    })

    await this.copy(pathUtil.join(__dirname, '../templates/base.ts'), pathUtil.join(outDir, './src/base.ts'))
    await this.copy(pathUtil.join(__dirname, '../templates/tsconfig.json'), pathUtil.join(outDir, './tsconfig.json'))
    await this.copy(pathUtil.join(__dirname, '../templates/gitignore'), pathUtil.join(outDir, './.gitignore'))
    await this.output(pathUtil.join(outDir, './src/api.ts'), source)
    await this.writePackage(oas.info)
  }

  private async setup () {
    await new Promise((resolve) => {
      fs.mkdir(pathUtil.join(this.outDir, './src'), () => resolve())
    })
    await new Promise((resolve) => {
      fs.mkdir(pathUtil.join(this.outDir, './src/schema'), () => resolve())
    })
  }

  private copy (source: string, destination: string) {
    return new Promise((resolve, reject) => {
      fs.readFile(source, (readError, data) => {
        readError ? reject(readError) : fs.writeFile(destination, data, (err) => {
          err ? reject(err) : resolve()
        })
      })
    })
  }

  private output (filepath: string, data: string | Buffer) {
    return new Promise((resolve, reject) => {
      fs.writeFile(filepath, data, (err) => {
        err ? reject(err) : resolve()
      })
    })
  }

  private async writePackage (info: OpenAPI.IInfoObject) {
    const content = JSON.stringify({
      name: `${kebabCase(info.title)}-sdk`,
      version: info.version,
      description: `${info.description} (auto generated sdk by kanamei/oas-typescript-codegen)`,
      private: true,
      main: 'dist/api.js',
      types: 'types/api.d.ts',
      scripts: {
        build: 'tsc -p .',
      },
      dependencies: {
        axios: 'latest'
      },
      devDependencies: {
        typescript: 'latest'
      },
    }, null, 2)
    await new Promise((resolve, reject) => {
      fs.writeFile(pathUtil.join(this.outDir, 'package.json'), content, (err) => {
        err ? reject(err) : resolve()
      })
    })
  }

  private extractRequestBody (operation: OpenAPI.IOperationObject): OpenAPI.IMediaTypeObject | undefined {
    if (!operation || !operation.operationId) {
      return undefined
    }
    const requestBody = operation.requestBody as OpenAPI.IRequestBodyObject
    if (!requestBody || !requestBody.content) {
      return undefined
    }
    const jsonRequestBody = requestBody.content[this.contentType]
    return jsonRequestBody
  }

  private extractResponseBody (operation: OpenAPI.IOperationObject): OpenAPI.IMediaTypeObject | undefined {
    if (!operation || !operation.operationId) {
      return undefined
    }
    const code = Object.keys(operation.responses).find((c) => c[0] === '2')
    const response: OpenAPI.IResponseObject = (code && operation.responses[code]) || operation.responses.default
    if (!response || !response.content) {
      return undefined
    }
    const jsonResponseBody = response.content[this.contentType]
    return jsonResponseBody
  }

  private extractRequestParameters (operation: OpenAPI.IOperationObject): OpenAPI.IMediaTypeObject | undefined {
    if (!operation || !operation.parameters) {
      return undefined
    }
    const queries = (operation.parameters as OpenAPI.IParameterObject[]).filter((parameter) => parameter.in === 'query')
    if (queries.length === 0) {
      return undefined
    }
    const properties = queries.reduce((prev, parameter) => {
      return {
        ...prev,
        [parameter.name]: parameter.schema,
      }
    }, {})
    return {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: queries.filter(({ required }) => required).map(({ name }) => name),
        properties,
      },
    }
  }

  private async compileInterface (operationId: string, type: string, schema: OpenAPI.ISchemaObject) {
    const intrefaceFileName = kebabCase(`${operationId}${type}`)
    const interfaceName = `I${upperFirst(operationId)}${type}`
    const content = await compileInterface(schema, interfaceName, {
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
    })
    await new Promise((resolve, reject) => {
      fs.writeFile(pathUtil.join(this.outDir, 'src/schema', `${intrefaceFileName}.ts`), content, (err) => {
        err ? reject(err) : resolve()
      })
    })
    return {
      interfaceName,
      intrefaceFileName,
      import: `import { ${interfaceName} } from './schema/${intrefaceFileName}'`,
    }
  }

  private loadSpecification (file: string) {
    return new Promise<string>((resolve, reject) => {
      fs.readFile(file, (err, data) => {
        err ? reject(err) : resolve(data.toString())
      })
    })
  }
}
