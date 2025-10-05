from django.views.generic import TemplateView


class FrontendAppView(TemplateView):
    template_name = "index.html"

    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)
