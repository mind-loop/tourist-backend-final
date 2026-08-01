declare module 'translate-google' {
  interface TranslateOptions {
    from?: string
    to: string
    except?: string[]
  }
  function translate(text: string, options: TranslateOptions): Promise<string>
  export default translate
}
