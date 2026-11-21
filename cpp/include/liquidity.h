#pragma once
#include "graph.h"
#include "json_helper.h"
#include <vector>
#include <string>
#include <map>
#include <limits>

struct FlowStep {
    std::string type; // "augmenting_path", "node_relaxed", "negative_cycle"
    SimpleJSON data;
};

struct MaxFlowResult {
    double maxFlow;
    std::map<std::string, std::map<std::string, double>> flowOnEdge;
    std::vector<std::vector<std::string>> augmentingPaths;
    std::vector<FlowStep> steps;
};

struct MinCutResult {
    std::vector<Edge> cutEdges;
    double cutCapacity;
    std::vector<std::string> sideS; // nodes reachable from source in residual
    std::vector<std::string> sideT;
};

struct ShortestPathResult {
    std::map<std::string, double> dist;
    std::map<std::string, std::string> prev;
    bool negativeCycle = false;
    std::vector<std::string> negativeCycleNodes;
    std::vector<FlowStep> steps;
};

class Liquidity {
public:
    explicit Liquidity(const Graph& g) : graph(g) {}

    // Edmonds-Karp max flow
    MaxFlowResult maxFlow(const std::string& source, const std::string& sink);

    // Min cut (uses maxFlow internally)
    MinCutResult minCut(const std::string& source, const std::string& sink);

    // Dijkstra
    ShortestPathResult dijkstra(const std::string& source);

    // Bellman-Ford
    ShortestPathResult bellmanFord(const std::string& source);

private:
    const Graph& graph;

    // Edmonds-Karp BFS: returns parent map if path found
    bool bfsResidual(const std::map<std::string, std::map<std::string, double>>& residual,
                     const std::string& src, const std::string& sink,
                     std::map<std::string, std::string>& parent,
                     std::vector<std::string>& path);
};
