import axios, { AxiosRequestConfig, AxiosTransformer, AxiosPromise, AxiosResponse, AxiosError, AxiosInstance } from 'axios'

export interface IDefinition {
  path: string
  method: string
}

export interface IAPIOptions {
  request?: AxiosRequestConfig
}

export class Retrier <U> {
  public retries = 0
  private process: () => Promise<AxiosResponse<U>>

  constructor (process: () => Promise<AxiosResponse<U>>) {
    this.process = process
  }

  public async retry () {
    this.retries++
    return this.process()
  }
}

export class BaseAPI {
  public client: AxiosInstance

  constructor (options: IAPIOptions) {
    this.client = axios.create(options.request)
  }

  public async send <U> (operationId: string, definition: IDefinition, listArguments: IArguments): Promise<AxiosResponse<U>> {
    const args = Array.from(listArguments)
    const path = definition.path.replace(/{\w+}/g, () => args.shift())
    const params = args.shift()
    await this.presend()
    return this.invoke<U>(definition.method, path, params)
      .catch((err) => this.onError<U>(err, new Retrier(() => this.send(operationId, definition, listArguments))))
  }

  protected invoke <U> (method: string, path: string, params: any): AxiosPromise<U> {
    switch (method) {
      case 'get':
        return this.client[method](path, { params })
      case 'post':
      case 'put':
      case 'patch':
        return this.client[method](path, params)
      case 'delete':
      case 'head':
        return this.client[method](path, { params })
      default:
        throw new Error(`unsupported method '${method}'`)
    }
  }

  protected async presend () {
    // noop
  }

  protected async onError <U> (err: AxiosError, retrier: Retrier<U>): Promise<AxiosResponse<U>> {
    return Promise.reject(err)
  }
}
