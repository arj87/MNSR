#pragma once
#include "graph.h"
#include "json_helper.h"
#include <vector>
#include <string>

struct SettlementStep {
    std::string type; // "node_settled", "gridlock_detected"
    SimpleJSON data;
};

struct TopoResult {
    bool success;
    std::vector<std::string> order;
    std::string errorMsg;
    std::vector<std::vector<std::string>> sccs; // only if gridlock
    std::vector<SettlementStep> steps;
};

struct SCCResult {
    std::vector<std::vector<std::string>> sccs;
    std::vector<std::vector<std::string>> gridlocks; // SCCs with size > 1
    std::vector<SettlementStep> steps;
};

class Settlement {
public:
    explicit Settlement(const Graph& g) : graph(g) {}

    // Kahn's algorithm topological sort
    TopoResult topologicalSort();

    // Tarjan's SCC
    SCCResult findSCC();

private:
    const Graph& graph;

    // Tarjan SCC helpers
    int scc_timer = 0;
    std::map<std::string, int> disc;
    std::map<std::string, int> low;
    std::map<std::string, bool> onStack;
    std::vector<std::string> stack;
    std::vector<std::vector<std::string>> sccs_result;

    void tarjanDFS(const std::string& u);
};
