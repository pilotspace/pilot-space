/** Allow importing .md files as raw strings via webpack asset/source loader. */
declare module '*.md' {
  const content: string;
  export default content;
}
