import type { H3Event } from 'h3'
import { QuerySchema } from '#shared/schemas/query'

const { select } = SqlBricks

function query2sql(query: Query, event: H3Event): string {
  const filter = query2filter(query)
  const { dataset } = useRuntimeConfig(event)
  // Use weighted distinct count to account for sampling
  // Formula: COUNT(DISTINCT col) * SUM(_sample_interval) / COUNT() ≈ actual distinct count
  const sql = select(`
    SUM(_sample_interval) as visits,
    ROUND(COUNT(DISTINCT ${logsMap.ip}) * SUM(_sample_interval) / COUNT()) as visitors,
    ROUND(COUNT(DISTINCT ${logsMap.referer}) * SUM(_sample_interval) / COUNT()) as referers
  `.trim().replace(/\s+/g, ' ')).from(dataset).where(filter)
  appendTimeFilter(sql, query)
  return sql.toString()
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const sql = query2sql(query, event)
  return useWAE(event, sql)
})
