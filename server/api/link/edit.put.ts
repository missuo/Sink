import type { z } from 'zod'
import { LinkSchema } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Edit an existing short link',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['url', 'slug'],
            properties: {
              url: { type: 'string', description: 'The target URL' },
              slug: { type: 'string', description: 'The slug of the link to edit' },
              comment: { type: 'string', description: 'Optional comment' },
              expiration: { type: 'integer', description: 'Expiration timestamp (unix seconds)' },
              title: { type: 'string', description: 'Custom title for link preview' },
              description: { type: 'string', description: 'Custom description for link preview' },
              image: { type: 'string', description: 'Custom image for link preview' },
              apple: { type: 'string', description: 'Apple App Store redirect URL' },
              google: { type: 'string', description: 'Google Play Store redirect URL' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot edit links.',
    })
  }
  const link = await readValidatedBody(event, LinkSchema.parse)

  const existingLink: z.infer<typeof LinkSchema> | null = await getLink(event, link.slug)
  if (!existingLink) {
    throw createError({
      status: 404,
      statusText: 'Link not found',
    })
  }

  const newLink = {
    ...existingLink,
    ...link,
    id: existingLink.id,
    createdAt: existingLink.createdAt,
    updatedAt: Math.floor(Date.now() / 1000),
  }
  await putLink(event, newLink)
  setResponseStatus(event, 201)
  const shortLink = buildShortLink(event, newLink.slug)
  return { link: newLink, shortLink }
})
