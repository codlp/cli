import {appFlags} from '../../../flags.js'
import metadata from '../../../metadata.js'
import Command from '../../../utilities/app-command.js'
import generate from '../../../services/generate.js'
import {showApiKeyDeprecationWarning} from '../../../prompts/deprecation-warnings.js'
import {Args, Flags} from '@oclif/core'
import {globalFlags} from '@shopify/cli-kit/node/cli'

export default class AppGenerateExtension extends Command {
  static description = 'Scaffold an Extension.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...globalFlags,
    ...appFlags,
    template: Flags.string({
      char: 't',
      hidden: false,
      description: `Extension template`,
      env: 'SHOPIFY_FLAG_EXTENSION_TEMPLATE',
    }),
    name: Flags.string({
      char: 'n',
      hidden: false,
      description: 'name of your Extension',
      env: 'SHOPIFY_FLAG_NAME',
    }),
    'clone-url': Flags.string({
      hidden: true,
      char: 'u',
      description:
        'The Git URL to clone the function extensions templates from. Defaults to: https://github.com/Shopify/function-examples',
      env: 'SHOPIFY_FLAG_CLONE_URL',
    }),
    flavor: Flags.string({
      hidden: false,
      description: 'Choose a starting template for your extension, where applicable',
      options: ['vanilla-js', 'react', 'typescript', 'typescript-react', 'wasm', 'rust'],
      env: 'SHOPIFY_FLAG_FLAVOR',
    }),
    reset: Flags.boolean({
      hidden: false,
      description: 'Reset all your settings.',
      env: 'SHOPIFY_FLAG_RESET',
      default: false,
      exclusive: ['config'],
    }),
    'api-key': Flags.string({
      hidden: true,
      description: 'The API key of your app.',
      env: 'SHOPIFY_FLAG_APP_API_KEY',
    }),
    'client-id': Flags.string({
      hidden: false,
      description: 'The Client ID of your app.',
      env: 'SHOPIFY_FLAG_CLIENT_ID',
    }),
  }

  static args = {
    file: Args.string(),
  }

  public static analyticsNameOverride(): string | undefined {
    return 'app scaffold extension'
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(AppGenerateExtension)
    if (flags['api-key']) {
      await showApiKeyDeprecationWarning()
    }
    const apiKey = flags['client-id'] || flags['api-key']

    await metadata.addPublicMetadata(() => ({
      cmd_scaffold_required_auth: true,
      cmd_scaffold_template_custom: flags['clone-url'] !== undefined,
      cmd_scaffold_type_owner: '@shopify/app',
    }))

    await generate({
      directory: flags.path,
      reset: flags.reset,
      apiKey,
      name: flags.name,
      cloneUrl: flags['clone-url'],
      template: flags.template,
      commandConfig: this.config,
      flavor: flags.flavor,
    })
  }
}
