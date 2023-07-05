import {gql} from 'graphql-request'

export const GetConfig = gql`
  query GetConfig($apiKey: String!) {
    app(apiKey: $apiKey) {
      id
      title
      apiKey
      appType
      grantedScopes
      applicationUrl
      redirectUrlWhitelist
      preferencesUrl
      contactEmail
      webhookApiVersion
      embedded
      posEmbedded
      gdprWebhooks {
        customerDeletionUrl
        customerDataRequestUrl
        shopDeletionUrl
      }
      appProxy {
        subPath
        subPathPrefix
        url
      }
    }
  }
`

export interface App {
  id: string
  title: string
  apiKey: string
  appType: string
  grantedScopes: string[]
  applicationUrl: string
  redirectUrlWhitelist: string[]
  contactEmail: string
  webhookApiVersion: string
  embedded: boolean
  posEmbedded?: boolean
  preferencesUrl?: string
  gdprWebhooks?: {
    customerDeletionUrl?: string
    customerDataRequestUrl?: string
    shopDeletionUrl?: string
  }
  appProxy?: {
    proxySubPath?: string
    proxySubPathPrefix?: string
    proxyUrl?: string
  }
}

export interface GetConfigQuerySchema {
  app: App
  appProxy?: {
    subPath?: string
    subPathPrefix?: string
    url?: string
  }
  preferencesUrl?: string
}