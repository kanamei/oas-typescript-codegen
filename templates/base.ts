import axios, { AxiosRequestConfig, AxiosTransformer, AxiosPromise } from 'axios'

export interface IDefinition {
  path: string
  method: string
}

export interface IAPIOptions {
  baseURL: string
  requestTransformer?: AxiosTransformer
}

export class BaseAPI {
  public baseURL: string
  public requestTransformer?: AxiosTransformer

  constructor (options: IAPIOptions) {
    this.baseURL = options.baseURL
    this.requestTransformer = options.requestTransformer
  }

  public send <U> (operationId: string, definition: IDefinition, listArguments: IArguments): AxiosPromise<U> {
    const args = Array.from(listArguments)
    const path = definition.path.replace(/{\w+}/g, () => args.shift())
    const params = args.shift()
    const config: AxiosRequestConfig = {
      baseURL: this.baseURL,
    }
    if (this.requestTransformer) {
      config.transformRequest = this.requestTransformer
    }
    switch (definition.method) {
      case 'get':
        return axios[definition.method](path, { ...config, params }) as AxiosPromise<U>
      case 'post':
      case 'put':
      case 'patch':
        return axios[definition.method](path, params, config) as AxiosPromise<U>
      case 'delete':
      case 'head':
        return axios[definition.method](path, { ...config, params }) as AxiosPromise<U>
      default:
        throw new Error(`unsupported method '${definition.method}'`)
    }
  }
}
