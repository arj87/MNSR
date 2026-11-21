#include "../include/settlement.h"
#include <queue>
#include <algorithm>

TopoResult Settlement::topologicalSort() {
    TopoResult result;
    result.success = false;

    // Kahn's algorithm
    std::map<std::string, int> inDegree;
    for (const auto& [id, _] : graph.nodes) inDegree[id] = 0;
    for (const auto& [from, nbrs] : graph.adjList)
        for (const auto& [to, w] : nbrs)
            inDegree[to]++;

    std::queue<std::string> q;
    for (const auto& [id, deg] : inDegree)
        if (deg == 0) q.push(id);

    while (!q.empty()) {
        auto u = q.front(); q.pop();
        result.order.push_back(u);

        SimpleJSON stepData = makeObject();
        stepData["node"] = SimpleJSON(u);
        stepData["settled_at"] = SimpleJSON((int)result.order.size());
        result.steps.push_back({"node_settled", stepData});

        for (const auto& [v, w] : graph.getNeighbors(u)) {
            inDegree[v]--;
            if (inDegree[v] == 0) q.push(v);
        }
    }

    if (result.order.size() != graph.nodes.size()) {
        // Cycle exists: gridlock
        result.success = false;
        result.errorMsg = "gridlock_detected";
        // Find SCCs to report gridlock
        SCCResult scc = findSCC();
        result.sccs = scc.gridlocks;

        SimpleJSON stepData = makeObject();
        std::vector<SimpleJSON> scc_arr;
        for (const auto& comp : scc.gridlocks) {
            std::vector<SimpleJSON> nodes_arr;
            for (const auto& n : comp) nodes_arr.push_back(SimpleJSON(n));
            scc_arr.push_back(SimpleJSON(nodes_arr));
        }
        stepData["gridlocks"] = SimpleJSON(scc_arr);
        result.steps.push_back({"gridlock_detected", stepData});
    } else {
        result.success = true;
    }
    return result;
}

void Settlement::tarjanDFS(const std::string& u) {
    disc[u] = low[u] = scc_timer++;
    stack.push_back(u);
    onStack[u] = true;

    for (const auto& [v, w] : graph.getNeighbors(u)) {
        if (!disc.count(v)) {
            tarjanDFS(v);
            low[u] = std::min(low[u], low[v]);
        } else if (onStack.count(v) && onStack[v]) {
            low[u] = std::min(low[u], disc[v]);
        }
    }

    if (low[u] == disc[u]) {
        std::vector<std::string> scc;
        while (true) {
            auto w = stack.back();
            stack.pop_back();
            onStack[w] = false;
            scc.push_back(w);
            if (w == u) break;
        }
        sccs_result.push_back(scc);
    }
}

SCCResult Settlement::findSCC() {
    // Reset state
    scc_timer = 0;
    disc.clear(); low.clear(); onStack.clear(); stack.clear(); sccs_result.clear();

    for (const auto& [id, _] : graph.nodes)
        onStack[id] = false;

    for (const auto& [id, _] : graph.nodes)
        if (!disc.count(id))
            tarjanDFS(id);

    SCCResult result;
    result.sccs = sccs_result;
    for (const auto& scc : sccs_result) {
        if (scc.size() > 1) result.gridlocks.push_back(scc);
        SimpleJSON stepData = makeObject();
        std::vector<SimpleJSON> nodes_arr;
        for (const auto& n : scc) nodes_arr.push_back(SimpleJSON(n));
        stepData["scc"] = SimpleJSON(nodes_arr);
        stepData["is_gridlock"] = SimpleJSON(scc.size() > 1);
        result.steps.push_back({"scc_found", stepData});
    }
    return result;
}
