import link, {LinkOptions} from './link.js'
import {saveCurrentConfig} from './use.js'
import {
  testApp,
  testOrganizationApp,
  buildVersionedAppSchema,
  testDeveloperPlatformClient,
} from '../../../models/app/app.test-data.js'
import {selectConfigName} from '../../../prompts/config.js'
import {loadApp, loadAppConfiguration} from '../../../models/app/loader.js'
import {InvalidApiKeyErrorMessage, fetchOrCreateOrganizationApp, appFromId} from '../../context.js'
import {getCachedCommandInfo} from '../../local-storage.js'
import {AppConfigurationInterface, AppInterface, CurrentAppConfiguration, EmptyApp} from '../../../models/app/app.js'
import {fetchAppRemoteConfiguration} from '../select-app.js'
import {DeveloperPlatformClient} from '../../../utilities/developer-platform-client.js'
import {MinimalAppIdentifiers, OrganizationApp} from '../../../models/organization.js'
import {beforeEach, describe, expect, test, vi} from 'vitest'
import {fileExistsSync, inTemporaryDirectory, readFile, writeFileSync} from '@shopify/cli-kit/node/fs'
import {joinPath} from '@shopify/cli-kit/node/path'
import {renderSuccess} from '@shopify/cli-kit/node/ui'
import {outputContent} from '@shopify/cli-kit/node/output'
import {setPathValue} from '@shopify/cli-kit/common/object'

vi.mock('./use.js')
vi.mock('../../../prompts/config.js')
vi.mock('../../../models/app/loader.js', async () => {
  const loader: any = await vi.importActual('../../../models/app/loader.js')
  return {
    ...loader,
    loadApp: vi.fn(),
    loadAppConfiguration: vi.fn(),
  }
})
vi.mock('../../local-storage')
vi.mock('@shopify/cli-kit/node/ui')
vi.mock('../../context/partner-account-info.js')
vi.mock('../../context.js')
vi.mock('../select-app.js')

const DEFAULT_REMOTE_CONFIGURATION = {
  name: 'app1',
  application_url: 'https://example.com',
  embedded: true,
  auth: {redirect_urls: ['https://example.com/callback1']},
  webhooks: {api_version: '2023-07'},
  pos: {embedded: false},
  access_scopes: {use_legacy_install_flow: true},
}

function buildDeveloperPlatformClient(): DeveloperPlatformClient {
  return testDeveloperPlatformClient({
    async appFromId({apiKey}: MinimalAppIdentifiers): Promise<OrganizationApp | undefined> {
      switch (apiKey) {
        case 'api-key':
          return testOrganizationApp({developerPlatformClient: this as DeveloperPlatformClient})
        default:
          return undefined
      }
    },
  })
}

beforeEach(async () => {
  vi.mocked(loadAppConfiguration).mockResolvedValue(new EmptyApp([]))
  vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(DEFAULT_REMOTE_CONFIGURATION)
})

describe('link', () => {
  test('does not ask for a name when it is provided as a flag', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        configName: 'Default value',
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))

      // When
      await link(options)

      // Then
      expect(selectConfigName).not.toHaveBeenCalled()
      expect(fileExistsSync(joinPath(tmp, 'shopify.app.default-value.toml'))).toBeTruthy()
    })
  })

  test('creates a new shopify.app.toml file when it does not exist using existing app version configuration instead of the api client configuration', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockRejectedValue('App not found')
      const apiClientConfiguration = {
        title: 'new-title',
        applicationUrl: 'https://api-client-config.com',
        redirectUrlWhitelist: ['https://api-client-config.com/callback'],
        requestedAccessScopes: ['write_products'],
        webhookApiVersion: '2023-07',
        embedded: false,
        posEmbedded: true,
        preferencesUrl: 'https://api-client-config.com/preferences',
        gdprWebhooks: {
          customerDeletionUrl: 'https://api-client-config.com/customer-deletion',
          customerDataRequestUrl: 'https://api-client-config.com/customer-data-request',
          shopDeletionUrl: 'https://api-client-config.com/shop-deletion',
        },
        appProxy: {
          subPath: '/api',
          subPathPrefix: 'prefix',
          url: 'https://api-client-config.com/proxy',
        },
        developerPlatformClient,
      }
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue({
        ...mockRemoteApp(apiClientConfiguration),
        newApp: true,
        developerPlatformClient,
      })

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "app1"
application_url = "https://example.com"
embedded = true

[build]
include_config_on_deploy = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
      expect(saveCurrentConfig).toHaveBeenCalledWith({configFileName: 'shopify.app.toml', directory: tmp})
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.toml is now linked to "app1" on Shopify',
        body: 'Using shopify.app.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.toml in your local project`],
          ['To upload your config, run', {command: 'npm run shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('uses the api client configuration in case there is no configuration app modules', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockRejectedValue('App not found')
      const apiClientConfiguration = {
        title: 'new-title',
        applicationUrl: 'https://api-client-config.com',
        redirectUrlWhitelist: ['https://api-client-config.com/callback'],
        requestedAccessScopes: ['write_products'],
        webhookApiVersion: '2023-07',
        embedded: false,
        posEmbedded: true,
        preferencesUrl: 'https://api-client-config.com/preferences',
        gdprWebhooks: {
          customerDeletionUrl: 'https://api-client-config.com/customer-deletion',
          customerDataRequestUrl: 'https://api-client-config.com/customer-data-request',
          shopDeletionUrl: 'https://api-client-config.com/shop-deletion',
        },
        appProxy: {
          subPath: '/api',
          subPathPrefix: 'prefix',
          url: 'https://api-client-config.com/proxy',
        },
      }
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue({
        ...mockRemoteApp(apiClientConfiguration),
        newApp: true,
        developerPlatformClient,
      })
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(undefined)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "new-title"
application_url = "https://api-client-config.com"
embedded = false

[build]
include_config_on_deploy = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
scopes = "write_products"

[auth]
redirect_urls = [ "https://api-client-config.com/callback" ]

[webhooks]
api_version = "2023-07"

  [webhooks.privacy_compliance]
  customer_deletion_url = "https://api-client-config.com/customer-deletion"
  customer_data_request_url = "https://api-client-config.com/customer-data-request"
  shop_deletion_url = "https://api-client-config.com/shop-deletion"

[app_proxy]
url = "https://api-client-config.com/proxy"
subpath = "/api"
prefix = "prefix"

[pos]
embedded = true

[app_preferences]
url = "https://api-client-config.com/preferences"
`
      expect(content).toEqual(expectedContent)
      expect(saveCurrentConfig).toHaveBeenCalledWith({configFileName: 'shopify.app.toml', directory: tmp})
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.toml is now linked to "new-title" on Shopify',
        body: 'Using shopify.app.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.toml in your local project`],
          ['To upload your config, run', {command: 'npm run shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('creates a new shopify.app.staging.toml file when shopify.app.toml already linked', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      const localApp = {
        configuration: {
          path: 'shopify.app.development.toml',
          name: 'my app',
          client_id: '12345',
          scopes: 'write_products',
          webhooks: {api_version: '2023-04'},
          application_url: 'https://myapp.com',
          embedded: true,
          build: {
            automatically_update_urls_on_dev: true,
            dev_store_url: 'my-store.myshopify.com',
            include_config_on_deploy: true,
          },
        } as CurrentAppConfiguration,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp, localApp, [], 'current'))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(
        testOrganizationApp({
          apiKey: '12345',
          developerPlatformClient,
        }),
      )
      vi.mocked(selectConfigName).mockResolvedValue('staging')
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        name: 'my app',
        application_url: 'https://myapp.com',
        access_scopes: {scopes: 'write_products'},
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.staging.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "my app"
application_url = "https://myapp.com"
embedded = true

[build]
automatically_update_urls_on_dev = true
dev_store_url = "my-store.myshopify.com"
include_config_on_deploy = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
scopes = "write_products"

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
      expect(saveCurrentConfig).toHaveBeenCalledWith({configFileName: 'shopify.app.staging.toml', directory: tmp})
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.staging.toml is now linked to "my app" on Shopify',
        body: 'Using shopify.app.staging.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.staging.toml in your local project`],
          ['To upload your config, run', {command: 'yarn shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('the local configuration is discarded if the client_id is different from the remote one', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      const localApp = {
        configuration: {
          path: 'shopify.app.toml',
          name: 'my app',
          client_id: '12345',
          scopes: 'write_products',
          webhooks: {api_version: '2023-04'},
          application_url: 'https://myapp.com',
          embedded: true,
          build: {
            automatically_update_urls_on_dev: true,
            dev_store_url: 'my-store.myshopify.com',
          },
        } as CurrentAppConfiguration,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp, localApp, [], 'current'))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(
        testOrganizationApp({
          apiKey: 'different-api-key',
          developerPlatformClient,
        }),
      )
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        name: 'my app',
        application_url: 'https://myapp.com',
        access_scopes: {scopes: 'write_products'},
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)
      vi.mocked(selectConfigName).mockResolvedValue('staging')

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.staging.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "different-api-key"
name = "my app"
application_url = "https://myapp.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
scopes = "write_products"

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })

  test('updates the shopify.app.toml when it already exists and is unlinked', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const filePath = joinPath(tmp, 'shopify.app.toml')
      const initialContent = `scopes = ""
      `
      writeFileSync(filePath, initialContent)
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.toml is now linked to "app1" on Shopify',
        body: 'Using shopify.app.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.toml in your local project`],
          ['To upload your config, run', {command: 'yarn shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('does not render success banner if shouldRenderSuccess is false', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const filePath = joinPath(tmp, 'shopify.app.toml')
      const initialContent = `scopes = ""
      `
      writeFileSync(filePath, initialContent)
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))

      // When
      await link(options, false)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
      expect(renderSuccess).not.toHaveBeenCalled()
    })
  })

  test('fetches the remote app when an api key is provided', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        apiKey: 'api-key',
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(selectConfigName).mockResolvedValue('staging')
      vi.mocked(appFromId).mockImplementation(async ({apiKey}: {apiKey: string}) => {
        return (await developerPlatformClient.appFromId({id: apiKey, apiKey, organizationId: '1'}))!
      })

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      expect(content).toContain('name = "app1"')
    })
  })

  test('throws an error when an invalid api key is is provided', async () => {
    vi.mocked(InvalidApiKeyErrorMessage).mockReturnValue({
      message: outputContent`Invalid Client ID`,
      tryMessage: outputContent`You can find the Client ID in the app settings in the Partners Dashboard.`,
    })

    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        apiKey: 'wrong-api-key',
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(selectConfigName).mockResolvedValue('staging')

      // When
      const result = link(options)

      // Then
      await expect(result).rejects.toThrow(/Invalid Client ID/)
    })
  })

  test('skips config name question if re-linking to existing current app schema', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      const localApp = {
        configuration: {
          path: 'shopify.app.foo.toml',
          name: 'my app',
          client_id: '12345',
          scopes: 'write_products',
          webhooks: {api_version: '2023-04'},
          application_url: 'https://myapp.com',
          embedded: true,
        } as CurrentAppConfiguration,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp, localApp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(
        testOrganizationApp({
          apiKey: '12345',
          developerPlatformClient,
        }),
      )
      vi.mocked(getCachedCommandInfo).mockReturnValue({askConfigName: false, selectedToml: 'shopify.app.foo.toml'})

      // When
      await link(options)

      expect(selectConfigName).not.toHaveBeenCalled()
      expect(saveCurrentConfig).toHaveBeenCalledWith({configFileName: 'shopify.app.foo.toml', directory: tmp})
    })
  })

  test('generates the file when there is no shopify.app.toml', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockRejectedValue(new Error('Shopify.app.toml not found'))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })

  test('uses scopes on platform if defined', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        access_scopes: {scopes: 'read_products,write_orders'},
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
scopes = "read_products,write_orders"

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })

  test('fetches the privacy compliance webhooks from the configuration module', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = testDeveloperPlatformClient({
        appExtensionRegistrations: (_app: MinimalAppIdentifiers) => Promise.resolve(remoteExtensionRegistrations),
      })
      const remoteExtensionRegistrations = {
        app: {
          extensionRegistrations: [],
          configurationRegistrations: [
            {
              type: 'PRIVACY_COMPLIANCE_WEBHOOKS',
              id: '123',
              uuid: '123',
              title: 'Privacy compliance webhooks',
              activeVersion: {
                config: JSON.stringify({
                  shop_redact_url: null,
                  customers_redact_url: 'https://example.com/customers',
                  customers_data_request_url: 'https://example.com/customers',
                }),
              },
            },
          ],
          dashboardManagedExtensionRegistrations: [],
        },
      }
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }

      vi.mocked(loadApp).mockRejectedValue('App not found')
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        webhooks: {
          api_version: '2023-07',
          subscriptions: [
            {
              compliance_topics: ['customers/redact', 'customers/data_request'],
              uri: 'https://example.com/customers',
            },
          ],
        },
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

  [[webhooks.subscriptions]]
  uri = "https://example.com/customers"
  compliance_topics = [ "customers/redact", "customers/data_request" ]

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
      expect(saveCurrentConfig).toHaveBeenCalledWith({configFileName: 'shopify.app.toml', directory: tmp})
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.toml is now linked to "app1" on Shopify',
        body: 'Using shopify.app.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.toml in your local project`],
          ['To upload your config, run', {command: 'npm run shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('the api client configuration is deep merged with the remote app_config extension registrations', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      const localApp = {
        configuration: {
          path: 'shopify.app.development.toml',
          name: 'my app',
          client_id: '12345',
          scopes: 'write_products',
          webhooks: {
            api_version: '2023-04',
          },
          application_url: 'https://myapp.com',
          embedded: true,
          pos: {
            embedded: false,
          },
        } as CurrentAppConfiguration,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp, localApp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(
        testOrganizationApp({
          apiKey: '12345',
          developerPlatformClient,
        }),
      )
      vi.mocked(selectConfigName).mockResolvedValue('staging')
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        name: 'my app',
        application_url: 'https://myapp.com',
        access_scopes: {scopes: 'write_products'},
        pos: {embedded: true},
        webhooks: {
          api_version: '2023-07',
          subscriptions: [{topics: ['products/create'], uri: 'https://my-app.com/webhooks'}],
        },
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.staging.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
name = "my app"
application_url = "https://myapp.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
scopes = "write_products"

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

  [[webhooks.subscriptions]]
  topics = [ "products/create" ]
  uri = "https://my-app.com/webhooks"

[pos]
embedded = true
`
      expect(content).toEqual(expectedContent)
      expect(renderSuccess).toHaveBeenCalledWith({
        headline: 'shopify.app.staging.toml is now linked to "my app" on Shopify',
        body: 'Using shopify.app.staging.toml as your default config.',
        nextSteps: [
          [`Make updates to shopify.app.staging.toml in your local project`],
          ['To upload your config, run', {command: 'yarn shopify app deploy'}],
        ],
        reference: [
          {
            link: {
              label: 'App configuration',
              url: 'https://shopify.dev/docs/apps/tools/cli/configuration',
            },
          },
        ],
      })
    })
  })

  test('when local app doesnt include build section and the remote app is new then include include_config_on_deploy is added', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const filePath = joinPath(tmp, 'shopify.app.toml')
      const initialContent = `scopes = ""
    `
      writeFileSync(filePath, initialContent)
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue({
        ...mockRemoteApp(),
        newApp: true,
        developerPlatformClient,
      })

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
application_url = "https://example.com"
embedded = true

[build]
include_config_on_deploy = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })

  test('replace arrays content with the remote one', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        auth: {
          redirect_urls: ['https://example.com/remote'],
        },
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/remote" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })

  test('write in the toml configuration fields not typed', async () => {
    await inTemporaryDirectory(async (tmp) => {
      // Given
      const developerPlatformClient = buildDeveloperPlatformClient()
      const options: LinkOptions = {
        directory: tmp,
        developerPlatformClient,
      }
      vi.mocked(loadApp).mockResolvedValue(await mockApp(tmp))
      vi.mocked(fetchOrCreateOrganizationApp).mockResolvedValue(mockRemoteApp({developerPlatformClient}))
      const remoteConfiguration = {
        ...DEFAULT_REMOTE_CONFIGURATION,
        handle: 'handle',
      }
      vi.mocked(fetchAppRemoteConfiguration).mockResolvedValue(remoteConfiguration)

      // When
      await link(options)

      // Then
      const content = await readFile(joinPath(tmp, 'shopify.app.toml'))
      const expectedContent = `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration

client_id = "12345"
extension_directories = [ ]
name = "app1"
handle = "handle"
application_url = "https://example.com"
embedded = true

[access_scopes]
# Learn more at https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes
use_legacy_install_flow = true

[auth]
redirect_urls = [ "https://example.com/callback1" ]

[webhooks]
api_version = "2023-07"

[pos]
embedded = false
`
      expect(content).toEqual(expectedContent)
    })
  })
})

async function mockApp(
  directory: string,
  app?: Partial<AppInterface>,
  flags = [],
  schemaType: 'current' | 'legacy' = 'legacy',
) {
  const versionSchema = await buildVersionedAppSchema()
  const localApp = testApp(app)
  localApp.configuration.client_id = schemaType === 'legacy' ? 12345 : '12345'
  localApp.configSchema = versionSchema.schema
  localApp.specifications = versionSchema.configSpecifications
  localApp.directory = directory
  setPathValue(localApp, 'remoteFlags', flags)
  return localApp
}

async function mockAppConfiguration(directory = ''): Promise<AppConfigurationInterface> {
  const {schema: configSchema} = await buildVersionedAppSchema()
  return {
    directory,
    configuration: {scopes: '', path: directory},
    configSchema,
  }
}

function mockRemoteApp(extraRemoteAppFields: Partial<OrganizationApp> = {}) {
  const remoteApp = testOrganizationApp()
  remoteApp.apiKey = '12345'
  return {...remoteApp, ...extraRemoteAppFields}
}
