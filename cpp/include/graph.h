#pragma once
#include <string>
#include <vector>
#include <map>
#include <set>
#include <queue>
#include <functional>
#include "json_helper.h"

struct Node {
    std::string id;
    double capital  = 0.0;
    double liquidity = 0.0;
    bool   defaulted = false;
    double debtRank  = 0.0;
};

struct Edge {
    std::string from;
    std::string to;
    double weight;
};

class Graph {
public:
    // adjacency list: adjList[from][to] = weight
    std::map<std::string, std::map<std::string, double>> adjList;
    std::map<std::string, Node> nodes;

    void clear();
    void addNode(const Node& n);
    void addEdge(const std::string& from, const std::string& to, double weight);
    void removeEdge(const std::string& from, const std::string& to);
    bool hasEdge(const std::string& from, const std::string& to) const;
    double edgeWeight(const std::string& from, const std::string& to) const;

    std::vector<std::string> getNodeIds() const;
    std::vector<Edge> getEdges() const;
    const std::map<std::string, double>& getNeighbors(const std::string& node) const;

    double totalEdgeWeight() const;

    // BFS from source: returns (visited_order, tree_edges)
    struct BFSResult {
        std::vector<std::string> visited;
        std::vector<Edge> treeEdges;
    };
    BFSResult bfs(const std::string& source) const;

    // DFS from source: returns (visited_order, tree_edges, back_edges)
    struct DFSResult {
        std::vector<std::string> visited;
        std::vector<Edge> treeEdges;
        std::vector<Edge> backEdges;
    };
    DFSResult dfs(const std::string& source) const;

    bool isWeaklyConnected() const;
    bool isStronglyConnected() const;

    // Net positions: map<id, net> where net = sum_in - sum_out
    std::map<std::string, double> computeNetPositions() const;

    // Adjacency matrix (index order = sorted node IDs)
    std::vector<std::string> matrixOrder() const;
    std::vector<std::vector<double>> adjacencyMatrix() const;

    // Generate synthetic networks
    static Graph generateRandom(int n, double density = 0.4);
    static Graph generateScaleFree(int n);
    static Graph generateCorePeriphery(int n);

private:
    void dfsHelper(const std::string& node, std::set<std::string>& visited,
                   std::vector<std::string>& order, std::vector<Edge>& treeEdges,
                   std::vector<Edge>& backEdges, std::map<std::string, std::string>& parent) const;

    static std::string bankName(int i);
};
