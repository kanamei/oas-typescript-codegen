import axios, { AxiosRequestConfig, AxiosTransformer, AxiosPromise, AxiosResponse, AxiosError } from 'axios'

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

  public async send <U> (operationId: string, definition: IDefinition, listArguments: IArguments): Promise<AxiosResponse<U>> {
    const args = Array.from(listArguments)
    const path = definition.path.replace(/{\w+}/g, () => args.shift())
    const params = args.shift()
    const config: AxiosRequestConfig = {
      baseURL: this.baseURL,
    }
    if (this.requestTransformer) {
      config.transformRequest = this.requestTransformer
    }
    await this.presend()
    return this.invoke<U>(definition.method, definition.path, config, params)
      .catch((err) => this.onError<U>(err))
  }

  protected invoke <U> (method: string, path: string, config: AxiosRequestConfig, params: any): AxiosPromise<U> {
    switch (method) {
      case 'get':
        return axios[method](path, { ...config, params })
      case 'post':
      case 'put':
      case 'patch':
        return axios[method](path, params, config)
      case 'delete':
      case 'head':
        return axios[method](path, { ...config, params })
      default:
        throw new Error(`unsupported method '${method}'`)
    }
  }

  protected async presend () {
    // noop
  }

  protected async onError <U> (err: AxiosError): Promise<AxiosResponse<U>> {
    return Promise.reject(err)
  }
}
