#pragma once
#include "graph.h"
#include "json_helper.h"
#include <vector>
#include <string>
#include <map>

struct NettingStep {
    std::string type; // "cycle_found", "edge_reduced", "edge_removed", "bilateral_net"
    SimpleJSON data;
};

struct NettingResult {
    std::vector<std::vector<std::string>> cancelledCycles;
    std::vector<Edge> removedEdges;
    double originalTotal;
    double newTotal;
    double savingsPct;
    std::map<std::string, double> netPositionsBefore;
    std::map<std::string, double> netPositionsAfter;
    std::vector<NettingStep> steps;
};

class Netting {
public:
    explicit Netting(Graph& g) : graph(g) {}

    // Find all simple cycles using DFS (Johnson's simplified)
    std::vector<std::vector<std::string>> findAllCycles();

    // Cancel one cycle: reduce min-weight edge, remove zeroed edges
    // Appends steps to provided vector
    void cancelCycle(const std::vector<std::string>& cycle, std::vector<NettingStep>& steps);

    // Run multilateral netting until no cycles remain
    NettingResult runMultilateralNetting();

    // Bilateral netting for each pair
    NettingResult runBilateralNetting();

    // Compute net positions
    static std::map<std::string, double> computeNetPositions(const Graph& g);

private:
    Graph& graph;

    bool findCycleDFS(const std::string& node, const std::string& start,
                      std::set<std::string>& visited,
                      std::vector<std::string>& path,
                      std::vector<std::string>& cycle,
                      int depth);

    std::vector<std::vector<std::string>> findAllCyclesHelper();
};
