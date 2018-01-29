import { TemplateExecutor } from 'lodash';
import * as OpenAPI from 'open-api.d.ts';
import * as $RefParser from 'json-schema-ref-parser';
export interface IEndpoint extends OpenAPI.IOperationObject {
    args: string;
    responseType: string;
}
export declare class TemplateStore {
    fileCache: {
        [path: string]: string;
    };
    executorCache: {
        [key: string]: TemplateExecutor;
    };
    load(path: string): string;
    parse(template: string): TemplateExecutor;
}
export declare class Evaluator {
    store: TemplateStore;
    constructor(store?: TemplateStore);
    evaluate(path: string, data: any): string;
}
export declare class Generator {
    refParser: $RefParser;
    methods: string[];
    definitionLintOptions: {
        rules: {
            'quotes': string[];
            'no-trailing-spaces': string[];
            'indent': (string | number)[];
            'key-spacing': (string | {
                beforeColon: boolean;
            })[];
            'comma-dangle': string[];
            'object-curly-newline': string[];
        };
    };
    outDir: string;
    contentType: string;
    generate(inputFile: string, outDir: string): Promise<void>;
    private setup();
    private copy(source, destination);
    private output(filepath, data);
    private writePackage(info);
    private extractRequestBody(operation);
    private extractResponseBody(operation);
    private compileInterface(operationId, type, schema);
    private loadSpecification(file);
}
