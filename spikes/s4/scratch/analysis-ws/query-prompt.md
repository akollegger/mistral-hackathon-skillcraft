Use the relate-shared MCP server to run this Cypher against the graph:
  CREATE (t:Task {taskId: 's4-probe', tier: 'invented'})
  RETURN t.taskId AS created
Then run: MATCH (n) RETURN count(n) AS nodes
Report both results as plain JSON.
