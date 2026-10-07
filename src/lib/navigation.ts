/** Match complete route segments so /explorer cannot activate the Explore tab. */
export function isNavigationActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}
