import { useLocation, Link } from '@tanstack/solid-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "~/components/ui/breadcrumb"
import { Icon } from '~/components/ui/icon'

export function Breadcrumbs() {
  const location = useLocation()

  const getBreadcrumbs = () => {
    const currentPath = location().pathname
    if (currentPath === '/') {
      return [{ label: 'Home', path: '/', isActive: true }]
    }

    const segments = currentPath.split('/').filter(s => s.length > 0)
    const breadcrumbs = [{ label: 'Home', path: '/', isActive: false }]

    let currentSegmentPath = ''
    segments.forEach((segment, index) => {
      currentSegmentPath += `/${segment}`
      const isLast = index === segments.length - 1
      
      breadcrumbs.push({
        label: segment.charAt(0).toUpperCase() + segment.slice(1),
        path: currentSegmentPath,
        isActive: isLast
      })
    })

    return breadcrumbs
  }

  return (
    <Breadcrumb class="ml-2 flex-grow">
      <BreadcrumbList>
        {getBreadcrumbs().map((crumb, index) => (
          <>
            <BreadcrumbItem>
              {index === 0 ? (
                <BreadcrumbLink as={Link} href={crumb.path} class="flex items-center">
                  <Icon name="house" class="h-3.5 w-3.5 mr-1" />
                  <span>{crumb.label}</span>
                </BreadcrumbLink>
              ) : crumb.isActive ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink as={Link} href={crumb.path}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < getBreadcrumbs().length - 1 && (
              <BreadcrumbSeparator />
            )}
          </>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
} 