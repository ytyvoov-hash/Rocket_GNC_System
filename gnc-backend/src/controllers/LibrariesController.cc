// gnc-backend/src/controllers/LibrariesController.cc
// Reads actuator_library.yaml + controller_library.yaml from disk
// (config.custom_config.actuator_library / .controller_library) using the
// shared parser::read_yaml_file helper. PATCH (RFC 6902) lands in Block 3.

#include "LibrariesController.h"
#include "ConfigPaths.h"
#include "../parser/YamlToJson.h"

#include <drogon/drogon.h>
#include <nlohmann/json.hpp>

namespace gnc::backend {

namespace {

drogon::HttpResponsePtr json_response(nlohmann::json body,
                                      drogon::HttpStatusCode code = drogon::k200OK)
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

}  // namespace

void LibrariesController::getActuators(const drogon::HttpRequestPtr&, Cb&& cb)
{
    auto path = config_path("actuator_library", "../actuator_library.yaml");
    cb(json_response(parser::read_yaml_file(path)));
}

void LibrariesController::patchActuators(const drogon::HttpRequestPtr&, Cb&& cb)
{
    // TODO[Block 3]: apply RFC-6902 JSON-Patch, re-validate against schema,
    // bump SHA-256, write back to disk under git lock.
    cb(json_response({{"_stub", true}, {"msg", "PATCH not yet implemented"}},
                     drogon::k503ServiceUnavailable));
}

void LibrariesController::getControllers(const drogon::HttpRequestPtr&, Cb&& cb)
{
    auto path = config_path("controller_library", "../controller_library.yaml");
    cb(json_response(parser::read_yaml_file(path)));
}

void LibrariesController::patchControllers(const drogon::HttpRequestPtr&, Cb&& cb)
{
    cb(json_response({{"_stub", true}, {"msg", "PATCH not yet implemented"}},
                     drogon::k503ServiceUnavailable));
}

}  // namespace gnc::backend
