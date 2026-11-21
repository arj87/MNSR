#include "../include/liquidity.h"
#include <queue>
#include <algorithm>
#include <cmath>

bool Liquidity::bfsResidual(const std::map<std::string, std::map<std::string, double>>& residual,
                             const std::string& src, const std::string& sink,
                             std::map<std::string, std::string>& parent,
                             std::vector<std::string>& path) {
    std::set<std::string> visited;
    std::queue<std::string> q;
    q.push(src);
    visited.insert(src);
    parent.clear();

    while (!q.empty()) {
        auto u = q.front(); q.pop();
        for (const auto& [v, cap] : residual.at(u)) {
            if (!visited.count(v) && cap > 1e-9) {
                parent[v] = u;
                visited.insert(v);
                if (v == sink) {
                    // Reconstruct path
                    path.clear();
                    std::string cur = sink;
                    while (cur != src) {
                        path.push_back(cur);
                        cur = parent[cur];
                    }
                    path.push_back(src);
                    std::reverse(path.begin(), path.end());
                    return true;
                }
                q.push(v);
            }
        }
    }
    return false;
}

MaxFlowResult Liquidity::maxFlow(const std::string& source, const std::string& sink) {
    MaxFlowResult result;
    result.maxFlow = 0.0;

    // Build residual graph
    std::map<std::string, std::map<std::string, double>> residual;
    for (const auto& [id, _] : graph.nodes) residual[id] = {};

    for (const auto& [from, nbrs] : graph.adjList) {
        for (const auto& [to, w] : nbrs) {
            residual[from][to] += w;
            if (!residual[to].count(from)) residual[to][from] = 0.0;
        }
    }

    // Initialize flow tracking
    for (const auto& [from, nbrs] : graph.adjList)
        for (const auto& [to, w] : nbrs)
            result.flowOnEdge[from][to] = 0.0;

    if (!graph.nodes.count(source) || !graph.nodes.count(sink) || source == sink) {
        return result;
    }

    std::map<std::string, std::string> parent;
    std::vector<std::string> path;

    while (bfsResidual(residual, source, sink, parent, path)) {
        // Find bottleneck
        double bottleneck = std::numeric_limits<double>::max();
        for (size_t i = 0; i + 1 < path.size(); i++)
            bottleneck = std::min(bottleneck, residual[path[i]][path[i+1]]);

        // Update residual and flow
        for (size_t i = 0; i + 1 < path.size(); i++) {
            residual[path[i]][path[i+1]] -= bottleneck;
            residual[path[i+1]][path[i]] += bottleneck;
            if (graph.hasEdge(path[i], path[i+1]))
                result.flowOnEdge[path[i]][path[i+1]] += bottleneck;
            else if (graph.hasEdge(path[i+1], path[i]))
                result.flowOnEdge[path[i+1]][path[i]] -= bottleneck;
        }

        result.maxFlow += bottleneck;
        result.augmentingPaths.push_back(path);

        SimpleJSON stepData = makeObject();
        std::vector<SimpleJSON> path_arr;
        for (const auto& n : path) path_arr.push_back(SimpleJSON(n));
        stepData["path"] = SimpleJSON(path_arr);
        stepData["bottleneck"] = SimpleJSON(bottleneck);
        stepData["total_flow_so_far"] = SimpleJSON(result.maxFlow);
        result.steps.push_back({"augmenting_path", stepData});
    }

    return result;
}

MinCutResult Liquidity::minCut(const std::string& source, const std::string& sink) {
    MinCutResult result;
    result.cutCapacity = 0.0;

    // Run max flow
    auto mf = maxFlow(source, sink);

    // Build residual after max flow to find reachable from source
    std::map<std::string, std::map<std::string, double>> residual;
    for (const auto& [id, _] : graph.nodes) residual[id] = {};
    for (const auto& [from, nbrs] : graph.adjList)
        for (const auto& [to, w] : nbrs) {
            residual[from][to] += w;
            if (!residual[to].count(from)) residual[to][from] = 0.0;
        }
    // Apply flow
    for (const auto& [from, nbrs] : mf.flowOnEdge) {
        for (const auto& [to, f] : nbrs) {
            residual[from][to] -= f;
            residual[to][from] += f;
        }
    }

    // BFS on residual from source
    std::set<std::string> reachable;
    std::queue<std::string> q;
    q.push(source); reachable.insert(source);
    while (!q.empty()) {
        auto u = q.front(); q.pop();
        for (const auto& [v, cap] : residual[u])
            if (!reachable.count(v) && cap > 1e-9) {
                reachable.insert(v);
                q.push(v);
            }
    }

    // Cut edges: from reachable to non-reachable
    for (const auto& from : reachable) {
        for (const auto& [to, _] : graph.nodes) {
            if (!reachable.count(to) && graph.hasEdge(from, to)) {
                result.cutEdges.push_back({from, to, graph.edgeWeight(from, to)});
                result.cutCapacity += graph.edgeWeight(from, to);
            }
        }
    }

    for (const auto& [id, _] : graph.nodes) {
        if (reachable.count(id)) result.sideS.push_back(id);
        else result.sideT.push_back(id);
    }

    return result;
}

ShortestPathResult Liquidity::dijkstra(const std::string& source) {
    ShortestPathResult result;
    const double INF = std::numeric_limits<double>::max();

    for (const auto& [id, _] : graph.nodes) result.dist[id] = INF;
    result.dist[source] = 0.0;

    // priority queue: (dist, node)
    std::priority_queue<std::pair<double,std::string>,
                        std::vector<std::pair<double,std::string>>,
                        std::greater<>> pq;
    pq.push({0.0, source});

    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > result.dist[u]) continue;

        for (const auto& [v, w] : graph.getNeighbors(u)) {
            double nd = result.dist[u] + w;
            if (nd < result.dist[v]) {
                result.dist[v] = nd;
                result.prev[v] = u;
                pq.push({nd, v});

                SimpleJSON stepData = makeObject();
                stepData["node"] = SimpleJSON(v);
                stepData["dist"] = SimpleJSON(nd);
                stepData["via"] = SimpleJSON(u);
                result.steps.push_back({"node_relaxed", stepData});
            }
        }
    }
    return result;
}

ShortestPathResult Liquidity::bellmanFord(const std::string& source) {
    ShortestPathResult result;
    const double INF = std::numeric_limits<double>::max();
    int n = graph.nodes.size();

    for (const auto& [id, _] : graph.nodes) result.dist[id] = INF;
    result.dist[source] = 0.0;

    auto edges = graph.getEdges();

    for (int i = 0; i < n - 1; i++) {
        bool updated = false;
        for (const auto& e : edges) {
            if (result.dist[e.from] != INF && result.dist[e.from] + e.weight < result.dist[e.to]) {
                result.dist[e.to] = result.dist[e.from] + e.weight;
                result.prev[e.to] = e.from;
                updated = true;

                SimpleJSON stepData = makeObject();
                stepData["node"] = SimpleJSON(e.to);
                stepData["dist"] = SimpleJSON(result.dist[e.to]);
                stepData["via"] = SimpleJSON(e.from);
                stepData["iteration"] = SimpleJSON(i + 1);
                result.steps.push_back({"node_relaxed", stepData});
            }
        }
        if (!updated) break;
    }

    // Check for negative cycles
    for (const auto& e : edges) {
        if (result.dist[e.from] != INF && result.dist[e.from] + e.weight < result.dist[e.to]) {
            result.negativeCycle = true;
            // Trace the cycle
            std::string cur = e.to;
            std::set<std::string> visited;
            while (!visited.count(cur)) {
                visited.insert(cur);
                result.negativeCycleNodes.push_back(cur);
                cur = result.prev.count(cur) ? result.prev[cur] : "";
                if (cur.empty()) break;
            }
            break;
        }
    }

    return result;
}
