// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import extensionInit from './extension'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {file, output, path} from '@shopify/cli-kit'
import {load as loadApp} from '$cli/models/app/app'
import {blocks, configurationFileNames, ExtensionTypes} from '$cli/constants'

describe('initialize a extension', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await file.mkTmpDir()
    const appConfigurationPath = path.join(tmpDir, configurationFileNames.app)
    const homeConfigurationPath = path.join(tmpDir, blocks.home.directoryName, blocks.home.configurationName)

    const appConfiguration = `
      name = "my_app"
      `
    const homeConfiguration = `
    [commands]
    build = "./build.sh"
    dev = "./test.sh"
    `
    await file.write(appConfigurationPath, appConfiguration)
    await file.mkdir(path.dirname(homeConfigurationPath))
    await file.write(homeConfigurationPath, homeConfiguration)
  })
  afterEach(async () => {
    vi.clearAllMocks()
    if (tmpDir) {
      await file.rmdir(tmpDir)
    }
  })

  interface CreateFromTemplateOptions {
    name: string
    extensionType: ExtensionTypes
  }
  const createFromTemplate = async ({name, extensionType}: CreateFromTemplateOptions) => {
    await extensionInit({
      name,
      extensionType,
      parentApp: await loadApp(tmpDir),
    })
  }

  it('successfully scaffolds the extension when no other extensions exist', async () => {
    vi.spyOn(output, 'info').mockImplementation(() => {})
    const name = 'my-ext-1'
    const extensionType = 'checkout-post-purchase'
    await createFromTemplate({name, extensionType})
    expect(output.info).toBeCalledWith(output.content`Generating ${configurationFileNames.extension}`)
    expect(output.info).toBeCalledWith(output.content`Generating index.js`)
    const scaffoldedExtension = (await loadApp(tmpDir)).extensions[0]
    expect(scaffoldedExtension.configuration.name).toBe(name)
  })

  it('successfully scaffolds the extension when another extension exists', async () => {
    const name1 = 'my-ext-1'
    const name2 = 'my-ext-2'
    const extensionType = 'checkout-post-purchase'
    await createFromTemplate({name: name1, extensionType})
    await createFromTemplate({name: name2, extensionType})
    const scaffoldedExtension2 = (await loadApp(tmpDir)).extensions[1]
    expect(scaffoldedExtension2.configuration.name).toBe(name2)
  })

  it('errors when trying to re-scaffold an existing extension', async () => {
    const name = 'my-ext-1'
    const extensionType = 'checkout-post-purchase'
    await createFromTemplate({name, extensionType})
    await expect(createFromTemplate({name, extensionType})).rejects.toThrow(`Extension ${name} already exists!`)
  })
})
